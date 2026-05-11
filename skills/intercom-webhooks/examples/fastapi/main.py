# Generated with: intercom-webhooks skill
# https://github.com/hookdeck/webhook-skills

import os
import hmac
import hashlib
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

intercom_client_secret = os.environ.get("INTERCOM_CLIENT_SECRET", "")


def verify_intercom_webhook(
    raw_body: bytes, signature_header: str | None, client_secret: str
) -> bool:
    """Verify an Intercom webhook signature.

    Intercom signs the raw JSON body with HMAC-SHA1 using your app's
    client_secret. The signature is sent in the X-Hub-Signature header as
    "sha1=<hex_digest>".
    """
    if not signature_header or not client_secret:
        return False

    try:
        algorithm, signature = signature_header.split("=", 1)
    except ValueError:
        return False
    if algorithm != "sha1" or not signature:
        return False

    expected = hmac.new(
        client_secret.encode("utf-8"),
        raw_body,
        hashlib.sha1,
    ).hexdigest()
    return hmac.compare_digest(signature, expected)


@app.post("/webhooks/intercom")
async def intercom_webhook(request: Request):
    # Read the raw body for signature verification
    raw_body = await request.body()
    signature_header = request.headers.get("x-hub-signature")

    if not verify_intercom_webhook(raw_body, signature_header, intercom_client_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload after verification
    notification = json.loads(raw_body)
    topic = notification.get("topic")
    item = (notification.get("data") or {}).get("item") or {}
    item_id = item.get("id")

    print(f"Received {topic} (notification id: {notification.get('id')})")

    if topic == "ping":
        # Handshake sent when the webhook is saved in the Developer Hub
        print("Ping received")

    elif topic == "conversation.user.created":
        print(f"New conversation from user: {item_id}")
        # TODO: Auto-acknowledge, route to a team, etc.

    elif topic == "conversation.user.replied":
        print(f"User replied to conversation: {item_id}")
        # TODO: Re-open ticket, alert on-call, etc.

    elif topic == "conversation.admin.replied":
        print(f"Admin replied to conversation: {item_id}")
        # TODO: Sync reply to CRM, etc.

    elif topic == "conversation.admin.assigned":
        print(f"Conversation assigned: {item_id}")

    elif topic == "conversation.admin.closed":
        print(f"Conversation closed: {item_id}")

    elif topic == "contact.user.created":
        print(f"New user contact: {item_id}")
        # TODO: Sync to CRM / data warehouse

    elif topic == "contact.lead.created":
        print(f"New lead contact: {item_id}")

    elif topic == "contact.user.tag.created":
        print(f"Tag applied to user: {item_id}")

    elif topic == "ticket.created":
        print(f"New ticket: {item_id}")

    elif topic == "ticket.admin.assigned":
        print(f"Ticket assigned: {item_id}")

    elif topic == "ticket.state.updated":
        print(f"Ticket state updated: {item_id}")

    else:
        print(f"Unhandled topic: {topic}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
