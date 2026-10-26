# Generated with: gc-notify-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

BEARER = re.compile(r"^bearer ", re.IGNORECASE)  # auth schemes are case-insensitive (RFC 9110)


def verify_gc_notify_request(headers, configured=None) -> bool:
    """GC Notify does not sign callbacks. It adds `Authorization: Bearer <token>` to every
    request, where the token is the one you set for the callback. The configured value is
    the bare token; if it was pasted with a leading "Bearer " the scheme is stripped.
    The secret is never trimmed or otherwise altered.
    """
    configured = configured if configured is not None else os.environ.get("GC_NOTIFY_WEBHOOK_SECRET", "")
    secret = BEARER.sub("", configured, count=1)
    if not secret:
        return False  # never accept when unconfigured
    header = headers.get("authorization")
    if header is None or not BEARER.match(header):
        return False
    # Compare bytes (compare_digest raises on non-ASCII str). Header values are exposed as
    # latin-1 text, so latin-1 recovers the raw bytes.
    return hmac.compare_digest(header[7:].encode("latin-1"), secret.encode("utf-8"))


async def require_gc_notify_token(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_gc_notify_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing bearer token")


def handle_receipt(payload: dict) -> None:
    # GC Notify callbacks have no event field: dispatch on status.
    status = payload.get("status")
    receipt_id = payload.get("id")
    kind = payload.get("notification_type")

    if payload.get("health_check"):
        print("GC Notify health check")
        return

    if status in ("created", "sending", "pending", "sent", "pending-virus-check"):
        print(f"{kind} {receipt_id} in transit ({status}) for {payload.get('reference')}")

    elif status == "delivered":
        print(f"{kind} {receipt_id} delivered to {payload.get('to')}")
        # TODO: mark the message delivered (payload["completed_at"])

    elif status == "permanent-failure":
        print(f"{kind} {receipt_id} permanently failed: {payload.get('status_description')}")
        # TODO: stop sending to this address or number

    elif status == "temporary-failure":
        print(f"{kind} {receipt_id} temporarily failed: {payload.get('status_description')}")
        # TODO: record it; a later callback may report the final outcome

    elif status == "technical-failure":
        print(f"{kind} {receipt_id} technical failure: {payload.get('provider_response')}")
        # TODO: alert and consider resending

    elif status == "virus-scan-failed":
        print(f"{kind} {receipt_id} attachment failed the virus scan")
        # TODO: tell the sender their attachment was rejected

    else:
        print(f"Unhandled status: {status}")


@app.post("/webhooks/gc-notify", dependencies=[Depends(require_gc_notify_token)])
async def gc_notify_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    # Respond within 1 second: keep slow work off this path (queue it).
    try:
        handle_receipt(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling GC Notify callback: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
