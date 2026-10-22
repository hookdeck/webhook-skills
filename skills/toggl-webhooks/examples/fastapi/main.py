# Generated with: toggl-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import json
import hmac
import hashlib

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_toggl_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify a Toggl Track webhook signature.

    Toggl sends ``X-Webhook-Signature-256: sha256=<hex>`` where <hex> is the
    HMAC-SHA256 of the full, unparsed request body keyed with the subscription secret.
    """
    if not signature_header or not secret:
        return False
    expected = "sha256=" + hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.encode("utf-8"), expected.encode("utf-8"))


@app.post("/webhooks/toggl")
async def toggl_webhook(request: Request):
    # Read the raw body BEFORE parsing — the signature covers the exact bytes.
    raw_body = await request.body()
    signature = request.headers.get("x-webhook-signature-256")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Webhook-Signature-256 header")
    if not verify_toggl_webhook(raw_body, signature, os.environ.get("TOGGL_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # PING events: payload is the string "ping". For subscriptions that are not
    # yet validated, they include validation_code — echo it to validate.
    if event.get("payload") == "ping":
        print(f"Toggl PING for subscription {event.get('subscription_id')}")
        if event.get("validation_code"):
            return {"validation_code": event["validation_code"]}
        return {"received": True}

    metadata = event.get("metadata") or {}
    payload = event.get("payload") or {}
    event_type = f"{metadata.get('model')}.{metadata.get('action')}"

    if event_type == "time_entry.created":
        print(f"Time entry created: {payload.get('description')}")
        # TODO: sync to billing, notify, etc.
    elif event_type == "time_entry.updated":
        print(f"Time entry updated: {payload.get('id')}")
    elif event_type == "time_entry.deleted":
        print(f"Time entry deleted: {payload.get('id') or metadata.get('model_id')}")
    elif event_type == "project.created":
        print(f"Project created: {payload.get('name')}")
    elif event_type == "project.updated":
        print(f"Project updated: {payload.get('name')}")
    elif event_type == "project.deleted":
        print(f"Project deleted: {payload.get('id') or metadata.get('model_id')}")
    else:
        print(f"Unhandled Toggl event: {event_type}")

    # Any 2xx acknowledges delivery; non-2xx triggers a later retry
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
