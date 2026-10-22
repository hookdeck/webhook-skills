import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_salesloft_signature(
    raw_body: bytes, signature: Optional[str], callback_token: Optional[str]
) -> bool:
    """Verify a Salesloft webhook signature.

    Salesloft sends x-salesloft-signature = hex(HMAC-SHA1(callback_token, rawBody)).
    There is no timestamp and no prefix.
    """
    if not signature or not callback_token:
        return False

    expected = hmac.new(callback_token.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()
    # Timing-safe comparison (compare_digest needs ASCII-only str inputs)
    return hmac.compare_digest(signature.strip().lower().encode("utf-8"), expected.encode("utf-8"))


def handle_salesloft_event(event_type: Optional[str], payload: object) -> None:
    """Handle a verified event. The event name is in the x-salesloft-event header."""
    if event_type == "person_created":
        print("Person created")
        # TODO: Sync the new person to your CRM or data warehouse

    elif event_type == "person_updated":
        print("Person updated")
        # TODO: Update your copy of the person

    elif event_type == "call_created":
        print("Call created")
        # TODO: Log the call activity

    elif event_type == "email_updated":
        print("Email updated")
        # TODO: Track opens, clicks, and replies

    elif event_type == "meeting_booked":
        print("Meeting booked")
        # TODO: Notify the account owner or create a calendar event

    elif event_type == "cadence_membership_created":
        print("Cadence membership created")
        # TODO: Record that a person was added to a cadence

    else:
        print(f"Unhandled Salesloft event: {event_type}")


@app.post("/webhooks/salesloft")
async def salesloft_webhook(request: Request):
    callback_token = os.environ.get("SALESLOFT_CALLBACK_TOKEN")
    if not callback_token:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("x-salesloft-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing x-salesloft-signature header")

    # Raw body for signature verification - don't parse JSON first
    raw_body = await request.body()
    if not verify_salesloft_signature(raw_body, signature, callback_token):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    handle_salesloft_event(request.headers.get("x-salesloft-event"), payload)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
