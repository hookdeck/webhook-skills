# Generated with: calendly-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

SIGNING_KEY = os.environ.get("CALENDLY_WEBHOOK_SIGNING_KEY", "")
# Reject timestamps older than this (seconds) to prevent replay attacks
TOLERANCE_SECONDS = 180


def verify_calendly_signature(
    raw_body: bytes,
    header: str | None,
    signing_key: str,
    tolerance_sec: int = TOLERANCE_SECONDS,
) -> bool:
    """Verify a Calendly webhook signature.

    Calendly sends a ``Calendly-Webhook-Signature`` header formatted as
    ``t=<timestamp>,v1=<signature>``. The signature is HMAC-SHA256 (hex) over
    ``{timestamp}.{raw body}`` using the subscription's signing key.
    """
    if not header:
        return False

    # Parse "t=...,v1=..." into a dict
    parts = dict(
        item.split("=", 1) for item in header.split(",") if "=" in item
    )
    timestamp = parts.get("t")
    signature = parts.get("v1")
    if not timestamp or not signature:
        return False

    # Replay protection: reject stale timestamps
    try:
        if abs(int(time.time()) - int(timestamp)) > tolerance_sec:
            return False
    except ValueError:
        return False

    # Signed content is "{timestamp}.{raw body}" — use the raw body, not parsed JSON
    signed_content = f"{timestamp}.".encode("utf-8") + raw_body
    expected = hmac.new(
        signing_key.encode("utf-8"), signed_content, hashlib.sha256
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(expected, signature)


@app.post("/webhooks/calendly")
async def calendly_webhook(request: Request):
    # Get the raw body for signature verification — do not parse JSON first
    raw_body = await request.body()
    header = request.headers.get("calendly-webhook-signature")

    if not header:
        raise HTTPException(
            status_code=400, detail="Missing Calendly-Webhook-Signature header"
        )

    if not verify_calendly_signature(raw_body, header, SIGNING_KEY):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Signature is valid — safe to parse the event
    event = json.loads(raw_body)
    event_type = event.get("event")
    payload = event.get("payload", {})

    if event_type == "invitee.created":
        print(f"Invitee scheduled: {payload.get('email')}")
        # TODO: Create CRM record, send confirmation, provision resources, etc.

    elif event_type == "invitee.canceled":
        print(f"Invitee canceled: {payload.get('email')}")
        # TODO: Free up availability, trigger win-back flow, update CRM, etc.

    elif event_type == "invitee_no_show.created":
        print(f"Invitee marked as no-show: {payload.get('invitee')}")
        # TODO: Flag account, send follow-up, adjust scoring, etc.

    elif event_type == "routing_form_submission.created":
        print(f"Routing form submitted: {payload.get('uri')}")
        # TODO: Qualify/route leads, sync to marketing tools, etc.

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 2xx to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
