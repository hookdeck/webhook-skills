# Generated with: onfleet-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re
from typing import Any, Dict, Optional

from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    # python-dotenv is optional; env vars can be set directly.
    pass


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Onfleet Webhook Handler")

HEX_PATTERN = re.compile(r"[0-9a-fA-F]+")  # use fullmatch: "$" also matches before a trailing newline


def verify_onfleet_signature(
    raw_body: bytes, signature_header: Optional[str], secret_hex: str
) -> Dict[str, Any]:
    """Verify the X-Onfleet-Signature header.

    Algorithm: HMAC-SHA512, lowercase hex digest
    Key:       the org-wide webhook secret, HEX-DECODED to bytes
    Signed:    the raw request body, nothing else (no timestamp, no prefix)

    The key must be ``bytes.fromhex(secret)`` (Onfleet's own sample uses
    ``binascii.a2b_hex``). Passing ``secret.encode()`` produces a well-formed
    digest that never matches.
    """
    if not signature_header:
        return {"valid": False, "error": "Missing X-Onfleet-Signature header"}

    expected = hmac.new(bytes.fromhex(secret_hex), raw_body, hashlib.sha512).hexdigest()

    # Onfleet's docs say to compare the hex strings. Normalise case defensively.
    # Compare as bytes: compare_digest raises TypeError on a str containing
    # non-ASCII characters, which a forged header can carry.
    received = signature_header.strip().lower().encode("utf-8")
    if not hmac.compare_digest(received, expected.encode("utf-8")):
        return {"valid": False, "error": "Invalid signature"}
    return {"valid": True}


def is_valid_hex_secret(secret: Optional[str]) -> bool:
    """bytes.fromhex skips whitespace and raises on odd lengths, so a mis-pasted
    secret would either be silently altered or crash the request. Check it."""
    return isinstance(secret, str) and len(secret) % 2 == 0 and bool(HEX_PATTERN.fullmatch(secret))


def handle_onfleet_event(event: Dict[str, Any]) -> None:
    """Process a verified event. Runs after the 200 has been sent: Onfleet times
    out after 10 seconds and disables the webhook after 300 consecutive failures.

    Fields irrelevant to a trigger arrive as null (not absent), and ``data`` can
    be {} or null — use ``or {}`` everywhere. Ids are opaque strings containing
    ~ and *.
    """
    data = event.get("data") or {}
    task = data.get("task") or {}
    worker = data.get("worker") or {}
    task_id = event.get("taskId") or task.get("id")
    worker_id = event.get("workerId") or worker.get("id")
    trigger = event.get("triggerName")

    # Task lifecycle (data.task)
    if trigger == "taskStarted":
        logger.info("Task started: %s", task_id)
    elif trigger == "taskEta":
        # etaSeconds is SECONDS and fractional; every other time field is ms.
        logger.info("Task ETA: %s eta seconds: %s", task_id, event.get("etaSeconds"))
    elif trigger == "taskArrival":
        logger.info("Worker arriving: %s distance (m): %s", task_id, event.get("distance"))
    elif trigger == "taskCompleted":
        logger.info("Task completed: %s", task_id)
    elif trigger == "taskFailed":
        details = task.get("completionDetails") or {}
        logger.info("Task failed: %s %s", task_id, details.get("failureReason"))
    elif trigger == "taskCreated":
        # Does not fire for dashboard task imports or for clones (see taskCloned).
        logger.info("Task created: %s", task_id)
    elif trigger == "taskUpdated":
        logger.info("Task updated: %s", task_id)
    elif trigger == "taskDeleted":
        logger.info("Task deleted: %s", task_id)
    elif trigger == "taskAssigned":
        container = task.get("container") or {}
        logger.info("Task assigned: %s container: %s", task_id, container.get("type"))
    elif trigger == "taskUnassigned":
        logger.info("Task unassigned: %s", task_id)
    elif trigger == "taskDelayed":
        logger.info("Task delayed: %s delay (s): %s", task_id, event.get("delay"))
    elif trigger == "taskCloned":
        logger.info("Task cloned: %s", task_id)
    # The trigger table names id 30 `predictedTaskDelay`; the published sample
    # payload carries `taskPredictedDelay`. Accept both (or route on triggerId 30).
    elif trigger in ("predictedTaskDelay", "taskPredictedDelay"):
        logger.info("Predicted task delay: %s delayTime: %s", task_id, task.get("delayTime"))

    # Workers (data.worker)
    elif trigger == "workerDuty":
        # status: 0 = off-duty, 1 = on-duty
        logger.info("Worker duty changed: %s status: %s", worker_id, event.get("status"))
    elif trigger == "workerCreated":
        logger.info("Worker created: %s", worker_id)
    elif trigger == "workerDeleted":
        logger.info("Worker deleted: %s", worker_id)
    elif trigger == "workerUpdated":
        logger.info("Worker updated: %s", worker_id)

    # SMS (top-level fields, data is {})
    elif trigger == "smsRecipientResponseMissed":
        logger.info("Missed SMS response from: %s", event.get("from"))
    elif trigger == "SMSRecipientOptOut":
        recipient = event.get("recipient") or {}
        logger.info("Recipient opted out of SMS: %s", recipient.get("id"))

    # Jobs (large payloads)
    elif trigger == "autoDispatchJobCompleted":
        dispatch = data.get("dispatch") or {}
        logger.info("Auto-dispatch completed: %s", event.get("dispatchId") or dispatch.get("id"))
    elif trigger == "taskBatchCreateJobCompleted":
        logger.info(
            "Batch create completed: %s created: %s errored: %s",
            event.get("status"),
            event.get("tasksCreated"),
            event.get("tasksErrored"),
        )
    elif trigger == "routeOptimizationJobCompleted":
        logger.info("Route optimization completed: %s", event.get("dispatchId"))

    # Route plans (data.routePlan, data.worker)
    elif trigger in (
        "routePlanCreated",
        "routePlanStarted",
        "routePlanCompleted",
        "routePlanUpdated",
        "routePlanUnassigned",
        "routePlanAssigned",
        "routePlanDelayed",
    ):
        logger.info("%s: %s worker: %s", trigger, event.get("routePlanId"), worker_id)

    else:
        # Onfleet adds triggers over time: log and acknowledge, don't error.
        logger.info("Unhandled Onfleet trigger: %s (id %s)", trigger, event.get("triggerId"))


def process_event(event: Dict[str, Any]) -> None:
    try:
        handle_onfleet_event(event)
    except Exception:  # noqa: BLE001
        # The 200 has already been sent; never let a handler error escape.
        logger.exception("Error processing Onfleet event")


@app.get("/webhooks/onfleet")
async def onfleet_validation(request: Request):
    """Validation handshake: Onfleet sends GET ?check=<random_string> when the
    webhook is created. Echo the value as plain text with a 200 (204 is
    rejected). This request is not signed — do not verify it."""
    check = request.query_params.get("check")
    if check is None:
        return PlainTextResponse("Missing check parameter", status_code=400)
    return PlainTextResponse(check, status_code=200)


@app.post("/webhooks/onfleet")
async def onfleet_webhook(request: Request, background_tasks: BackgroundTasks):
    secret = os.getenv("ONFLEET_WEBHOOK_SECRET")
    if not is_valid_hex_secret(secret):
        # Fail closed: never accept unverified deliveries.
        logger.error("ONFLEET_WEBHOOK_SECRET is missing or not a hex string; rejecting webhook")
        return PlainTextResponse("Webhook secret not configured", status_code=500)

    # Read the RAW body. Do not use `await request.json()` here — the signature
    # is over these exact bytes, and re-serializing a parsed dict breaks it.
    raw_body = await request.body()
    verification = verify_onfleet_signature(
        raw_body, request.headers.get("x-onfleet-signature"), secret
    )
    if not verification["valid"]:
        logger.error("Onfleet webhook verification failed: %s", verification["error"])
        return PlainTextResponse(f"Webhook Error: {verification['error']}", status_code=400)

    try:
        event = json.loads(raw_body)
    except ValueError as exc:
        logger.error("Invalid JSON payload: %s", exc)
        return PlainTextResponse("Invalid JSON payload", status_code=400)

    if not isinstance(event, dict):
        return PlainTextResponse("Invalid JSON payload", status_code=400)

    # Acknowledge first, then process: Onfleet times out at 10 seconds.
    background_tasks.add_task(process_event, event)
    return JSONResponse(status_code=200, content={"received": True})


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    logger.info("Server running on http://localhost:%s", port)
    logger.info("Webhook endpoint: GET + POST http://localhost:%s/webhooks/onfleet", port)
    uvicorn.run(app, host="0.0.0.0", port=port)
