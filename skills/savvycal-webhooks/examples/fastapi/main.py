# Generated with: savvycal-webhooks skill
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

WEBHOOK_SECRET = os.environ.get("SAVVYCAL_WEBHOOK_SECRET", "")

_HEX_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_PREFIX = re.compile(r"^sha256=", re.IGNORECASE)


def verify_savvycal_signature(
    raw_body: bytes, header: str | None, secret: str
) -> bool:
    """Verify a SavvyCal webhook signature.

    SavvyCal sends an ``x-savvycal-signature`` header containing the HMAC-SHA256
    of the raw request body, keyed with the webhook's secret. The docs' header
    example is ``sha256=<UPPERCASE hex>``, while their Elixir sample compares the
    bare uppercase digest, so accept both: strip an optional ``sha256=`` prefix
    and compare the hex case-insensitively.
    """
    if not header or not secret:
        return False

    received = _PREFIX.sub("", header.strip()).lower()
    if not _HEX_SHA256.match(received):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(expected.encode(), received.encode())


@app.post("/webhooks/savvycal")
async def savvycal_webhook(request: Request):
    # Get the raw body for signature verification - do not parse JSON first
    raw_body = await request.body()
    header = request.headers.get("x-savvycal-signature")

    if not header:
        raise HTTPException(
            status_code=400, detail="Missing x-savvycal-signature header"
        )

    if not verify_savvycal_signature(raw_body, header, WEBHOOK_SECRET):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Signature is valid - safe to parse the event
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("type")
    event_id = event.get("id")

    if event_type == "event.created":
        print(f"Event scheduled: {event_id}")
        # TODO: Create CRM record, send confirmation, provision resources, etc.

    elif event_type == "event.rescheduled":
        print(f"Event rescheduled: {event_id}")
        # TODO: Update calendar holds, notify attendees, sync to CRM, etc.

    elif event_type == "event.canceled":
        print(f"Event canceled: {event_id}")
        # TODO: Free up availability, trigger win-back flow, update CRM, etc.

    elif event_type == "event.changed":
        print(f"Event changed: {event_id}")
        # TODO: Diff the change details and sync downstream systems

    elif event_type == "event.checkout.completed":
        print(f"Checkout completed: {event_id}")
        # TODO: Mark the booking as paid, issue receipts, etc.

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 2xx quickly to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
