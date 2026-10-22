# Generated with: todoist-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Delivery IDs already processed. Use a shared store (Redis, DB) in production.
seen_deliveries: set[str] = set()


def verify_todoist_webhook(raw_body: bytes, signature_header: str | None, client_secret: str | None) -> bool:
    """Verify base64(HMAC-SHA256(client_secret, raw body)) from X-Todoist-Hmac-SHA256."""
    if not signature_header or not client_secret:
        return False
    expected = base64.b64encode(
        hmac.new(client_secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")
    return hmac.compare_digest(signature_header.encode(), expected.encode())


@app.post("/webhooks/todoist")
async def todoist_webhook(request: Request):
    # Raw body for signature verification (do not use request.json())
    raw_body = await request.body()
    signature = request.headers.get("x-todoist-hmac-sha256")
    delivery_id = request.headers.get("x-todoist-delivery-id")

    if not verify_todoist_webhook(raw_body, signature, os.environ.get("TODOIST_CLIENT_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Retries reuse the same X-Todoist-Delivery-ID
    if delivery_id and delivery_id in seen_deliveries:
        return {"received": True, "duplicate": True}
    if delivery_id:
        seen_deliveries.add(delivery_id)

    event_name = event.get("event_name")
    data = event.get("event_data", {})
    print(f"Received {event_name} for user {event.get('user_id')}")

    if event_name == "item:added":
        print(f"Task added: {data.get('id')} {data.get('content')}")
    elif event_name == "item:updated":
        print(f"Task updated: {data.get('id')}")
    elif event_name == "item:completed":
        print(f"Task completed: {data.get('id')}")
    elif event_name == "item:uncompleted":
        print(f"Task uncompleted: {data.get('id')}")
    elif event_name == "item:deleted":
        print(f"Task deleted: {data.get('id')}")
    elif event_name == "note:added":
        print(f"Comment added: {data.get('id')}")
    elif event_name == "project:added":
        print(f"Project added: {data.get('id')} {data.get('name')}")
    else:
        print(f"Unhandled event: {event_name}")

    # Todoist treats anything other than 200 as a failed delivery
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
