import hashlib
import hmac
import json
import os
import re
import time
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

_HEX_DIGEST = re.compile(r"[0-9a-fA-F]{64}")


def verify_chili_piper_signature(
    raw_body: bytes,
    signature: Optional[str],
    timestamp: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify a Chili Piper webhook signature.

    Chili Piper sends `X-Chili-Signature` = lowercase hex HMAC-SHA256 of
    `{X-Chili-Timestamp}.{raw body}`, keyed with the tenant's signing secret
    (UTF-8 bytes, used as-is).
    """
    if not signature or not timestamp or not secret:
        return False

    # Validate the format before decoding
    if not _HEX_DIGEST.fullmatch(signature):
        return False

    # Signed message built as bytes: timestamp header (latin-1) + "." + raw body
    signed = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()

    # Compare bytes (never str) in constant time
    return hmac.compare_digest(bytes.fromhex(signature), expected)


def is_timestamp_fresh(
    timestamp: str, tolerance_seconds: float, now: Optional[float] = None
) -> bool:
    """Optional replay check on `X-Chili-Timestamp` (Unix seconds).

    A tolerance of 0 (default) disables the check.
    """
    if not tolerance_seconds or tolerance_seconds <= 0:
        return True
    if not re.fullmatch(r"[0-9]+", timestamp):
        return False
    current = time.time() if now is None else now
    return abs(current - int(timestamp)) <= tolerance_seconds


def handle_chili_piper_event(payload: Dict[str, Any]) -> None:
    # The body's `type` matches the webhook type: Created, Updated or Deleted
    event_type = payload.get("type")

    if event_type == "Created":
        print(f"Meeting {payload.get('meetingIdChili')} booked: {payload.get('meetingTitle')} at {payload.get('meetingStartTime')}")
        # TODO: Create the meeting in your CRM or notify the host
    elif event_type == "Updated":
        print(f"Meeting {payload.get('meetingIdChili')} updated: {payload.get('meetingStartTime')}, assignee {payload.get('assigneeEmail')}")
        # TODO: Sync the new time or assignee
    elif event_type == "Deleted":
        print(f"Meeting {payload.get('meetingIdChili')} canceled")
        # TODO: Remove the meeting from your CRM
    else:
        print(f"Unhandled Chili Piper event type: {event_type}")


@app.post("/webhooks/chili-piper")
async def chili_piper_webhook(request: Request):
    secret = os.getenv("CHILI_PIPER_WEBHOOK_SECRET")
    if not secret:
        print("CHILI_PIPER_WEBHOOK_SECRET is not configured")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("x-chili-signature")
    timestamp = request.headers.get("x-chili-timestamp")

    # Raw bytes for signature verification - don't parse JSON first
    raw_body = await request.body()

    if not verify_chili_piper_signature(raw_body, signature, timestamp, secret):
        print("Chili Piper webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        tolerance = float(os.getenv("CHILI_PIPER_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0
    if not is_timestamp_fresh(timestamp, tolerance):
        raise HTTPException(status_code=401, detail="Timestamp outside tolerance")

    # Parse only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Retry behavior is not documented: de-duplicate on meetingIdChili + type
    handle_chili_piper_event(payload)

    return {"received": True, "type": payload.get("type")}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
