# Generated with: twenty-webhooks skill
# https://github.com/hookdeck/webhook-skills
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

HEX_64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_twenty_signature(
    raw_body: bytes,
    signature: str | None,
    timestamp: str | None,
    secret: str,
    tolerance_seconds: int = 0,
) -> bool:
    """Verify a Twenty webhook.

    X-Twenty-Webhook-Signature is the bare hex HMAC-SHA256 of the bytes
    "<X-Twenty-Webhook-Timestamp>:" + raw body, keyed with the webhook secret
    (UTF-8, used as-is). Twenty has no Python verification helper, so verify
    manually.

    Timestamp tolerance is opt-in: Hookdeck retries and replays resend the
    original timestamp, so a window is off unless tolerance_seconds > 0.
    The timestamp is Date.now(), Unix milliseconds.
    """
    if not signature or not timestamp or not secret:
        return False

    # Validate format first (exact length and alphabet)
    if not HEX_64.fullmatch(signature):
        return False

    if tolerance_seconds > 0:
        if not re.fullmatch(r"[0-9]+", timestamp):
            return False
        if abs(time.time() * 1000 - int(timestamp)) > tolerance_seconds * 1000:
            return False

    # Build the signed message as bytes: "<timestamp>:" + raw body (never a re-encoded string)
    try:
        signed_payload = b"".join([timestamp.encode("latin-1"), b":", raw_body])
    except UnicodeEncodeError:
        return False
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest().encode()

    # Hex is case-insensitive; compare bytes in constant time
    return hmac.compare_digest(expected, signature.lower().encode())


@app.post("/webhooks/twenty")
async def twenty_webhook(request: Request):
    # Get the raw body for signature verification (any content type)
    payload = await request.body()
    tolerance = int(os.environ.get("TWENTY_WEBHOOK_TOLERANCE_SECONDS") or 0)

    if not verify_twenty_signature(
        payload,
        request.headers.get("x-twenty-webhook-signature"),
        request.headers.get("x-twenty-webhook-timestamp"),
        os.environ.get("TWENTY_WEBHOOK_SECRET", ""),
        tolerance,
    ):
        print("Twenty webhook verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after the signature check
    try:
        body = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    body = body if isinstance(body, dict) else {}
    # Twenty's sender uses `eventName`; its docs page shows `event`
    event_name = body.get("eventName") or body.get("event")
    record = body.get("record") or body.get("data") or {}
    record_id = record.get("id") if isinstance(record, dict) else None

    # Handle the event based on <object>.<created|updated|deleted>
    if event_name == "person.created":
        print(f"Person created: {record_id}")
        # TODO: Sync the new contact to your system

    elif event_name == "person.deleted":
        print(f"Person deleted: {record_id}")
        # TODO: Remove or archive the contact

    elif event_name == "company.updated":
        print(f"Company updated: {record_id}")
        # TODO: Refresh the company in your system

    elif event_name == "opportunity.updated":
        print(f"Opportunity updated: {record_id}")
        # TODO: React to stage or amount changes

    elif event_name == "note.created":
        print(f"Note created: {record_id}")
        # TODO: Attach the note to the related record

    else:
        # Any other object (custom objects included) and action: <object>.<action>
        print(f"Unhandled event: {event_name}")

    # Any 2xx acknowledges the delivery
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
