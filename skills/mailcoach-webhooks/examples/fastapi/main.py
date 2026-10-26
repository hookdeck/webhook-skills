# Generated with: mailcoach-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

HEX_64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_signature(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Mailcoach: `Signature` = lowercase hex HMAC-SHA256 of the raw body, keyed with the secret (UTF-8)."""
    if not signature_header or not secret:
        return False
    # Validate the shape first: exactly 64 hex characters (hex is case-insensitive)
    if not HEX_64.fullmatch(signature_header):
        return False
    computed = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes, never str: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(signature_header.lower().encode("ascii"), computed.encode("ascii"))


@app.post("/webhooks/mailcoach")
async def mailcoach_webhook(request: Request):
    # Raw bytes are required for signature verification: do not parse before the check
    raw_body = await request.body()
    signature = request.headers.get("signature")

    if not verify_signature(raw_body, signature, os.getenv("MAILCOACH_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Missing or invalid Signature header")

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is in the body (`event`); no header carries it
    event = payload.get("event") if isinstance(payload, dict) else None
    if event == "UnconfirmedSubscriberCreatedEvent":
        print(f"Unconfirmed subscriber: {payload.get('email')} (list {payload.get('email_list_uuid')})")
        # TODO: wait for SubscribedEvent before treating them as subscribed
    elif event == "SubscribedEvent":
        print(f"Subscribed: {payload.get('email')} (list {payload.get('email_list_uuid')})")
        # TODO: create or update the subscriber in your database
    elif event == "UnsubscribedEvent":
        print(f"Unsubscribed: {payload.get('email')} (list {payload.get('email_list_uuid')})")
        # TODO: mark the subscriber as unsubscribed
    elif event == "CampaignSentEvent":
        print(f"Campaign sent: {payload.get('name')} to {payload.get('sent_to_number_of_subscribers')} subscribers")
        # TODO: record the send and its statistics
    else:
        print("Unhandled event:", event)

    return {"received": True}
