# Generated with: sinch-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Standard padded base64 of a 32-byte digest: 43 characters + "="
BASE64_SHA256 = re.compile(r"[A-Za-z0-9+/]{43}=")

# Sinch callbacks have no type field: exactly one callback-specific top-level key is present
CALLBACK_KEYS = [
    "message",
    "message_delivery_report",
    "event",
    "event_delivery_report",
    "message_submit_notification",
    "conversation_start_notification",
    "conversation_stop_notification",
    "contact_create_notification",
    "contact_delete_notification",
    "contact_update_notification",
    "contact_merge_notification",
    "opt_in_notification",
    "opt_out_notification",
    "capability_notification",
    "batch_status_update_notification",
    "duplicated_contact_identities_notification",
    "unsupported_callback",
]


def verify_sinch_signature(
    raw_body: bytes,
    signature: str | None,
    nonce: str | None,
    timestamp: str | None,
    secret: str,
    tolerance_seconds: int = 0,
) -> bool:
    """Verify Sinch Conversation API callback headers.

    x-sinch-webhook-signature is base64(HMAC-SHA256(secret, body + "." + nonce + "." + timestamp)),
    where nonce and timestamp come from x-sinch-webhook-signature-nonce / -timestamp.
    The secret is the webhook's `secret`, used as UTF-8 bytes as-is. Sinch has no
    Python verification helper, so verify manually.

    Timestamp tolerance is opt-in: Hookdeck retries and replays resend the
    original timestamp, so a window is off unless tolerance_seconds > 0.
    """
    if not signature or not nonce or not timestamp or not secret:
        return False
    if not BASE64_SHA256.fullmatch(signature):
        return False
    try:
        received = base64.b64decode(signature, validate=True)
    except (binascii.Error, ValueError):
        return False
    # Reject non-canonical encodings (stray low bits in the last character): Hookdeck compares base64 exactly
    if base64.b64encode(received).decode("ascii") != signature:
        return False

    if tolerance_seconds > 0:
        if not re.fullmatch(r"[0-9]+", timestamp):
            return False
        if abs(time.time() - int(timestamp)) > tolerance_seconds:
            return False

    # Build the signed message as bytes: body "." nonce "." timestamp (never a re-encoded body string)
    try:
        signed_data = b"".join([raw_body, b".", nonce.encode("latin-1"), b".", timestamp.encode("latin-1")])
    except UnicodeEncodeError:
        return False
    expected = hmac.new(secret.encode("utf-8"), signed_data, hashlib.sha256).digest()

    # Compare bytes in constant time (never str)
    return hmac.compare_digest(expected, received)


@app.post("/webhooks/sinch")
async def sinch_webhook(request: Request):
    # Get the raw body for signature verification
    raw_body = await request.body()
    tolerance = int(os.environ.get("SINCH_WEBHOOK_TOLERANCE_SECONDS") or 0)

    if not verify_sinch_signature(
        raw_body,
        request.headers.get("x-sinch-webhook-signature"),
        request.headers.get("x-sinch-webhook-signature-nonce"),
        request.headers.get("x-sinch-webhook-signature-timestamp"),
        os.environ.get("SINCH_WEBHOOK_SECRET", ""),
        tolerance,
    ):
        print("Sinch webhook verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after the signature check
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    if not isinstance(payload, dict):
        payload = {}

    callback_key = next((key for key in CALLBACK_KEYS if payload.get(key) is not None), None)

    if callback_key == "message":
        message = payload["message"]
        print(f"Inbound message: {message.get('id')} {(message.get('channel_identity') or {}).get('channel')}")
        # TODO: Process the contact's message (payload["message"]["contact_message"])

    elif callback_key == "message_delivery_report":
        report = payload["message_delivery_report"]
        print(f"Delivery report: {report.get('message_id')} {report.get('status')}")
        # TODO: Update the delivery status of the message

    elif callback_key == "contact_create_notification":
        print(f"Contact created: {(payload['contact_create_notification'].get('contact') or {}).get('id')}")
        # TODO: Sync the new contact

    elif callback_key is None:
        print(f"Unrecognised callback, keys: {list(payload.keys())}")

    else:
        print(f"Received {callback_key} callback")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
