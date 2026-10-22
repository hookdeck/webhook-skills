# Generated with: kombo-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_kombo_webhook(raw_body: bytes, signature_header: Optional[str], secret: Optional[str]) -> bool:
    """Verify a Kombo webhook signature.

    Kombo signs the RAW request body with HMAC-SHA256, keyed with the Kombo
    Webhook Secret's UTF-8 bytes (not decoded), and sends the digest in the
    X-Kombo-Signature header as base64url WITHOUT padding.
    """
    if not signature_header or not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()

    # Compare base64url text (Kombo strips the padding) so trailing junk can't decode to a match
    expected_b64 = base64.urlsafe_b64encode(expected).rstrip(b"=")
    return hmac.compare_digest(signature_header.rstrip("=").encode(), expected_b64)


@app.post("/webhooks/kombo")
async def kombo_webhook(
    request: Request,
    x_kombo_signature: Optional[str] = Header(None),
):
    # request.body() is the raw bytes Kombo signed, whatever the Content-Type
    raw_body = await request.body()

    # Verify first, before parsing
    if not verify_kombo_webhook(raw_body, x_kombo_signature, os.getenv("KOMBO_WEBHOOK_SECRET")):
        # 4xx is not retried by Kombo
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Payload shape: {id, type, data}. The event name is `type`.
    event_id = event.get("id")
    event_type = event.get("type")
    data = event.get("data") or {}
    print(f"Received Kombo event: {event_type} ({event_id})")

    # Kombo may deliver an event more than once: dedupe on `id` in production.
    if event_type == "data-changed":
        print("Data changed:", data.get("integration_id"), data.get("changed_models"))
        # TODO: fetch updated data from Kombo with the updated_after filter
    elif event_type == "sync-finished":
        # Deprecated by Kombo; prefer data-changed
        print("Sync finished:", data.get("sync_id"), data.get("sync_state"))
    elif event_type == "integration-created":
        print("Integration created:", data.get("id"), data.get("tool"))
        # TODO: store the integration
    elif event_type == "integration-deleted":
        print("Integration deleted:", data.get("id"))
        # TODO: remove the integration and its data
    elif event_type == "integration-state-changed":
        print("Integration state changed:", data.get("integration_id"), data.get("state"))
        # TODO: if INVALID, ask the customer to reconnect
    elif event_type == "connection-flow-failed":
        print("Connection flow failed:", data.get("integration_tool"), data.get("log_url"))
    elif event_type == "issue-status-changed":
        print("Issue", data.get("change"), (data.get("issue") or {}).get("type"))
    elif event_type == "assessment:order-received":
        print("Assessment ordered:", data.get("id"), data.get("package_id"))
    else:
        # Kombo adds event types over time: acknowledge unknown ones
        print(f"Unhandled event: {event_type}")

    # Acknowledge quickly with a 2xx
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
