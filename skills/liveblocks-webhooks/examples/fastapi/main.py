# Generated with: liveblocks-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

app = FastAPI(title="Liveblocks Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """Liveblocks sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


@app.post("/webhooks/liveblocks")
async def liveblocks_webhook(request: Request):
    secret = os.environ.get("LIVEBLOCKS_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("LIVEBLOCKS_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    sig_headers = read_signature_headers(request.headers)
    if not all(sig_headers.values()):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Liveblocks signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # A malformed signature entry raises ValueError rather than WebhookVerificationError, so catch Exception.
        Webhook(secret).verify(raw_body, sig_headers, json_parse=False)
    except Exception as err:
        print(f"Liveblocks webhook verification failed: {err}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Every body is { type, data }: the event name is the camelCase top-level `type`
    event_type = event.get("type")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    # webhook-id is stable across retries and the body has no event id: use it to deduplicate
    print(f"Received Liveblocks webhook {sig_headers['webhook-id']}: {event_type}")

    if event_type == "userEntered":
        print(f"User entered room: {data.get('roomId')} {data.get('userId')} ({data.get('numActiveUsers')} active)")
    elif event_type == "userLeft":
        print(f"User left room: {data.get('roomId')} {data.get('userId')} ({data.get('numActiveUsers')} active)")
    elif event_type == "storageUpdated":
        # Throttled at 60 seconds: not sent for every write
        print(f"Storage updated: {data.get('roomId')} {data.get('updatedAt')}")
    elif event_type == "roomCreated":
        print(f"Room created: {data.get('roomId')}")
    elif event_type == "roomDeleted":
        print(f"Room deleted: {data.get('roomId')}")
    elif event_type == "ydocUpdated":
        # Throttled at 60 seconds: not sent for every write
        print(f"Yjs document updated: {data.get('roomId')} {data.get('updatedAt')}")
    elif event_type == "commentCreated":
        print(f"Comment created: {data.get('commentId')} in thread {data.get('threadId')}")
    elif event_type == "commentEdited":
        print(f"Comment edited: {data.get('commentId')} in thread {data.get('threadId')}")
    elif event_type == "commentDeleted":
        print(f"Comment deleted: {data.get('commentId')} in thread {data.get('threadId')}")
    elif event_type == "commentReactionAdded":
        print(f"Reaction added: {data.get('emoji')} on comment {data.get('commentId')}")
    elif event_type == "commentReactionRemoved":
        print(f"Reaction removed: {data.get('emoji')} on comment {data.get('commentId')}")
    elif event_type == "threadCreated":
        print(f"Thread created: {data.get('threadId')}")
    elif event_type == "threadDeleted":
        print(f"Thread deleted: {data.get('threadId')}")
    elif event_type == "threadMetadataUpdated":
        print(f"Thread metadata updated: {data.get('threadId')}")
    elif event_type == "commentMetadataUpdated":
        print(f"Comment metadata updated: {data.get('commentId')}")
    elif event_type == "threadMarkedAsResolved":
        print(f"Thread resolved: {data.get('threadId')}")
    elif event_type == "threadMarkedAsUnresolved":
        print(f"Thread unresolved: {data.get('threadId')}")
    elif event_type == "notification":
        # data.kind is "thread", "textMention" or a custom "$"-prefixed kind
        print(f"Notification: {data.get('kind')} for user {data.get('userId')}")
    else:
        # The documented list may grow: ignore what you don't need
        print(f"Unhandled event type: {event_type}")

    return {"received": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
