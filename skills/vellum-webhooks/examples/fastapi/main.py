# Generated with: vellum-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: bytes, b: bytes) -> bool:
    """Constant-time comparison (compare_digest on equal-length digests of bytes)."""
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())


def verify_vellum_request(headers, secret=None, header_name=None) -> bool:
    """Vellum Monitoring webhooks are authenticated with a static header you configure:
    API Key Header (any header name) or Bearer Token (Authorization: Bearer <token>).
    The whole header value is compared; a "Bearer " prefix is not stripped or parsed.
    Vellum's optional HMAC signature (X-Vellum-Timestamp / X-Vellum-Signature) is NOT verified here.
    """
    secret = secret if secret is not None else os.environ.get("VELLUM_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("VELLUM_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # Encode both sides to bytes: compare_digest raises on non-ASCII str.
    return safe_equal(received.encode("utf-8"), secret.encode("utf-8"))


async def require_vellum_credential(request: Request) -> None:
    """FastAPI dependency: reject the request, for every method, before the body is read."""
    if not verify_vellum_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


# In-memory dedupe on the event id. Use a shared store (Redis, database) in production.
seen: set = set()


def handle_event(payload: dict) -> None:
    name = payload.get("name")
    body = payload.get("body") or {}

    if name == "workflow.execution.initiated":
        print(f"Workflow execution initiated: {(body.get('workflow_class') or {}).get('name')}")
        # TODO: record the run start (body["inputs"])

    elif name == "workflow.execution.fulfilled":
        print(f"Workflow execution fulfilled: {(body.get('workflow_class') or {}).get('name')}")
        # TODO: store the result (body["outputs"])

    elif name == "workflow.execution.rejected":
        error = body.get("error") or {}
        print(f"Workflow execution rejected: {error.get('code')} {error.get('message')}")
        # TODO: alert on the failure (body["error"])

    elif name in ("workflow_execution.usage_calculation.fulfilled", "workflow.usage_calculation.fulfilled"):
        print("Workflow usage calculated")
        # TODO: record cost (body["usage"], body["cost"])

    elif name == "workflow_execution.usage_calculation.rejected":
        print("Workflow usage calculation failed")
        # TODO: flag the run for re-calculation

    elif name == "metric.execution.fulfilled":
        print("Metric execution fulfilled")
        # TODO: store the metric result (body)

    else:
        print(f"Unhandled event: {name}")


# Vellum's docs don't name the HTTP method, so accept any of these.
@app.api_route(
    "/webhooks/vellum",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    dependencies=[Depends(require_vellum_credential)],
)
async def vellum_webhook(request: Request):
    # Read the raw body so any content type is accepted; an empty body is fine.
    raw_body = await request.body()
    if not raw_body.strip():
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    event_id = payload.get("id")
    if event_id:
        if event_id in seen:
            return {"received": True, "duplicate": True}
        seen.add(event_id)

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        if event_id:
            seen.discard(event_id)  # let a retry reprocess it
        print(f"Error handling Vellum event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
