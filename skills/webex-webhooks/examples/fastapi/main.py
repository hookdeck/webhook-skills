# Generated with: webex-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
from typing import Optional
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

webex_webhook_secret = os.environ.get("WEBEX_WEBHOOK_SECRET", "")


def verify_webex_webhook(raw_body: bytes, signature: Optional[str], secret: str) -> bool:
    """Verify a Webex webhook signature.

    When a webhook is created with a `secret`, Webex sends the hex HMAC-SHA1 of the
    raw request body (keyed with the secret string as-is) in `X-Spark-Signature`.
    """
    if not signature or not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()
    # Timing-safe comparison to prevent timing attacks
    return hmac.compare_digest(signature, expected)


@app.post("/webhooks/webex")
async def webex_webhook(request: Request):
    # Read the raw body for signature verification (do not parse before verifying)
    raw_body = await request.body()
    signature = request.headers.get("x-spark-signature")

    # Verify webhook signature
    if not verify_webex_webhook(raw_body, signature, webex_webhook_secret):
        return JSONResponse(status_code=400, content={"error": "Invalid signature"})

    # Parse the payload after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    # Webex identifies an event by resource + event, e.g. messages + created
    event = f"{payload.get('resource')}.{payload.get('event')}"
    data = payload.get("data") or {}

    print(f"Received {event} event")

    # Handle the event based on type
    if event == "messages.created":
        # The webhook carries ids only; GET /v1/messages/{id} to fetch the text
        print(f"Message {data.get('id')} in room {data.get('roomId')} from {data.get('personEmail')}")
        # TODO: Fetch the message with your bot token and reply, route commands, etc.

    elif event == "messages.deleted":
        print(f"Message deleted: {data.get('id')}")
        # TODO: Remove the message from your own store, audit log, etc.

    elif event == "memberships.created":
        print(f"Membership created: {data.get('personEmail')} in room {data.get('roomId')}")
        # TODO: Send a welcome message, sync access, etc.

    elif event == "memberships.deleted":
        print(f"Membership deleted: {data.get('personEmail')} from room {data.get('roomId')}")
        # TODO: Offboarding, access sync, etc.

    elif event == "rooms.created":
        print(f"Room created: {data.get('id')}")
        # TODO: Provision resources for the new room, etc.

    elif event == "rooms.updated":
        print(f"Room updated: {data.get('id')}")
        # TODO: Sync room state (e.g. locked/unlocked), etc.

    elif event == "meetings.started":
        print(f"Meeting started: {data.get('id')}")
        # TODO: Notify attendees, start tracking, etc.

    elif event == "meetings.ended":
        print(f"Meeting ended: {data.get('id')}")
        # TODO: Trigger follow-ups, summaries, etc.

    elif event == "attachmentActions.created":
        print(f"Card action {data.get('id')} on message {data.get('messageId')}")
        # TODO: GET /v1/attachment/actions/{id} to read the submitted inputs

    else:
        print(f"Unhandled event: {event}")

    # Return 200 to acknowledge receipt (Webex disables webhooks that keep failing)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
