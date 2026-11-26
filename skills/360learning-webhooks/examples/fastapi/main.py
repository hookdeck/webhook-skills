# Generated with: 360learning-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""360Learning webhook receiver for FastAPI.

360Learning delivers webhooks through Svix and signs them the Standard
Webhooks way:
  webhook-id         unique event ID, the same on every retry
  webhook-timestamp  Unix seconds of this attempt
  webhook-signature  space-separated "v1,<base64 HMAC-SHA256>" entries
                     (two during the 24 hours after a secret rotation)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: the base64-DECODED signing secret of the subscription. Strip an optional
whsec_ prefix first.

360Learning's own Node sample signs JSON.stringify(req.body). That only
matches when re-serialising reproduces the exact bytes sent. Verify the raw
body instead.
"""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any, Dict, List, Mapping, Optional, Sequence, Union

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("360learning-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="360Learning Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
processed_event_ids: set = set()


def parse_secrets(value: Optional[str]) -> List[str]:
    """Each subscription (one per event type) has its own secret.

    A route that receives several subscriptions needs all of them,
    comma-separated.
    """
    return [s.strip() for s in (value or "").split(",") if s.strip()]


def verify_360learning_webhook(
    raw_body: Union[bytes, str],
    headers: Mapping[str, Optional[str]],
    secrets: Union[str, Sequence[str], None],
    tolerance_seconds: Optional[int] = None,
) -> bool:
    """Return True if any v1 signature matches any secret.

    tolerance_seconds is an optional freshness window (None = off).
    360Learning recommends one (5 minutes); a delivery replayed later through
    a relay keeps its original timestamp, so a window rejects it. Dedupe on
    webhook-id either way.
    """
    webhook_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signature_header = headers.get("webhook-signature")
    secret_list = [secrets] if isinstance(secrets, str) else list(secrets or [])
    secret_list = [s for s in secret_list if s]
    if not webhook_id or not timestamp or not signature_header or not secret_list:
        return False
    if not timestamp.isdigit():
        return False
    if tolerance_seconds is not None and abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
        return False

    given = []
    for entry in signature_header.split():
        version, _, signature = entry.partition(",")
        if version != "v1" or not signature:
            continue
        try:
            given.append(base64.b64decode(signature))
        except (binascii.Error, ValueError):
            continue

    body = raw_body.encode() if isinstance(raw_body, str) else raw_body
    ok = False
    for secret in secret_list:
        try:
            key = base64.b64decode(secret.removeprefix("whsec_"), validate=True)
        except (binascii.Error, ValueError):
            continue
        if not key:
            continue
        expected = hmac.new(key, f"{webhook_id}.{timestamp}.".encode() + body, hashlib.sha256).digest()
        # Check every v1 entry: after a rotation one is signed with the new
        # secret and one with the old. Any match passes.
        for signature in given:
            if hmac.compare_digest(signature, expected):
                ok = True
    return ok


def handle_event(event: Dict[str, Any]) -> None:
    """Most events are {type, timestamp (ms), data}.

    The xapi and xapi.started subscriptions send an xAPI statement (no type).
    """
    event_type = event.get("type")
    if not isinstance(event_type, str):
        if event.get("verb") and event.get("actor"):
            logger.info(
                "xAPI statement %s: %s %s",
                event.get("id"),
                (event.get("verb") or {}).get("id"),
                (event.get("object") or {}).get("id"),
            )
        else:
            logger.info("Unrecognised 360Learning payload")
        return

    data = event.get("data") or {}
    if event_type in (
        "user.created",
        "user.updated",
        "user.deleted",
        "user.activated",
        "user.invited",
        "user.reactivated",
    ):
        logger.info("%s: user %s", event_type, data.get("userId"))
    elif event_type == "course.attempt.closed":
        logger.info(
            "Attempt %s on course %s closed (%s)", data.get("attemptId"), data.get("courseId"), data.get("reason")
        )
    elif event_type == "path.session.user.status.updated":
        logger.info("User %s is %s in session %s", data.get("userId"), data.get("status"), data.get("sessionId"))
    elif event_type in ("path.session.users.enrolled", "path.session.users.unenrolled"):
        # No user IDs in the payload: call List all enrollments for the session.
        logger.info("%s: session %s of path %s", event_type, data.get("sessionId"), data.get("pathId"))
    elif event_type == "user.certificate.awarded":
        logger.info("Certificate %s awarded to %s", data.get("certificateId"), data.get("userId"))
    elif event_type == "user.assessment.corrected":
        logger.info("Assessment %s for %s: success=%s", data.get("assessmentId"), data.get("userId"), data.get("success"))
    elif event_type == "bulk.operation.ended":
        logger.info("Bulk operation %s (%s) %s", data.get("bulkOperationId"), data.get("type"), data.get("status"))
    else:
        # 54 event types exist. Acknowledge the ones you don't handle.
        logger.info("Unhandled 360Learning event type: %s", event_type)


@app.post("/webhooks/360learning")
async def threesixty_learning_webhook(request: Request) -> Dict[str, Any]:
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secrets = parse_secrets(os.environ.get("THREE_SIXTY_LEARNING_WEBHOOK_SECRET"))
    if not secrets:
        logger.error("THREE_SIXTY_LEARNING_WEBHOOK_SECRET is not set: rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "webhook-id": request.headers.get("webhook-id"),
        "webhook-timestamp": request.headers.get("webhook-timestamp"),
        "webhook-signature": request.headers.get("webhook-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()
    tolerance_env = os.environ.get("THREE_SIXTY_LEARNING_WEBHOOK_TOLERANCE_SECONDS")
    tolerance = int(tolerance_env) if tolerance_env else None
    if not verify_360learning_webhook(raw_body, headers, secrets, tolerance):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # webhook-id is the same on every retry: acknowledge duplicates.
    event_id = headers["webhook-id"]
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    # Respond within 15 seconds: verify, enqueue, return 2xx, work asynchronously.
    handle_event(event)
    processed_event_ids.add(event_id)
    return {"received": True}


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
