# Generated with: whoop-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

# X-WHOOP-Signature is the 44-character padded base64 of a 32-byte digest
SIG_RE = re.compile(r"[A-Za-z0-9+/]{43}=")


def verify_whoop_signature(
    raw_body: bytes,
    signature: Optional[str],
    timestamp: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify a WHOOP webhook signature.

    base64(HMAC-SHA256(client_secret, X-WHOOP-Signature-Timestamp + raw body)),
    with no separator between the timestamp and the body.
    """
    if not signature or not timestamp or not secret or not SIG_RE.fullmatch(signature):
        return False

    try:
        message = timestamp.encode("latin-1") + raw_body
    except UnicodeEncodeError:
        return False

    digest = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    # Compare bytes, never str. Both are 44 ASCII characters here.
    return hmac.compare_digest(base64.b64encode(digest), signature.encode("ascii"))


def is_timestamp_fresh(
    timestamp: str, tolerance_seconds: Optional[float], now_ms: Optional[float] = None
) -> bool:
    """Optional replay protection. Off unless a positive tolerance is configured,
    because Hookdeck retries and replays resend the original timestamp.
    The timestamp is Unix MILLISECONDS."""
    if not tolerance_seconds or tolerance_seconds <= 0:
        return True
    if not re.fullmatch(r"[0-9]+", timestamp):
        return False
    if now_ms is None:
        now_ms = time.time() * 1000
    return abs(now_ms - int(timestamp)) <= tolerance_seconds * 1000


def _tolerance() -> Optional[float]:
    try:
        return float(os.environ.get("WHOOP_WEBHOOK_TOLERANCE_SECONDS", ""))
    except ValueError:
        return None


@app.post("/webhooks/whoop")
async def whoop_webhook(request: Request):
    # Exact bytes: the signature covers the raw body
    raw_body = await request.body()
    signature = request.headers.get("x-whoop-signature")
    timestamp = request.headers.get("x-whoop-signature-timestamp")

    # Verify the signature before trusting the payload
    if not verify_whoop_signature(
        raw_body, signature, timestamp, os.environ.get("WHOOP_WEBHOOK_SECRET")
    ):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    if not is_timestamp_fresh(timestamp, _tolerance()):
        return JSONResponse({"error": "Timestamp outside tolerance"}, status_code=401)

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(event, dict):
        return JSONResponse({"error": "Invalid payload"}, status_code=400)

    event_type = event.get("type")
    object_id = event.get("id")
    print(f"Received {event_type} for user {event.get('user_id')} (id {object_id}, trace {event.get('trace_id')})")

    # Payloads are thin: fetch the record from the v2 API using `id`.
    # For recovery.* events, `id` is the UUID of the associated sleep.
    if event_type == "sleep.updated":
        # TODO: GET /v2/activity/sleep/{id}
        print(f"Sleep {object_id} created or updated")
    elif event_type == "workout.updated":
        # TODO: GET /v2/activity/workout/{id}
        print(f"Workout {object_id} created or updated")
    elif event_type == "recovery.updated":
        # TODO: fetch the recovery for sleep {id}
        print(f"Recovery for sleep {object_id} created or updated")
    else:
        # sleep.deleted, workout.deleted, recovery.deleted and anything new
        print(f"Unhandled event type: {event_type}")

    return JSONResponse({"received": True})


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
