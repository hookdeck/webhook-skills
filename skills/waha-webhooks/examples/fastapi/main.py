import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_waha_signature(
    raw_body: bytes,
    signature: Optional[str],
    secret: Optional[str],
    algorithm: Optional[str] = "sha512",
) -> bool:
    """Verify a WAHA webhook signature.

    WAHA sends X-Webhook-Hmac = hex(HMAC-SHA512(key, raw_body)) where the key is
    used as a UTF-8 string, plus X-Webhook-Hmac-Algorithm: sha512.
    """
    if not signature or not secret:
        return False
    # WAHA documents sha512 only; reject anything else rather than guess
    if (algorithm or "sha512").lower() != "sha512":
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(signature.lower().encode(), expected.encode())


def handle_waha_event(event: dict) -> None:
    """Dispatch a verified WAHA event on the envelope's `event` field."""
    name = event.get("event")
    payload = event.get("payload") or {}

    if name == "message":
        print(f"Incoming message from {payload.get('from')}: {payload.get('body')}")
        # TODO: Route to your bot / inbox logic
    elif name == "message.any":
        print(f"Message (any direction) {payload.get('id')}, fromMe={payload.get('fromMe')}")
        # TODO: Mirror the full conversation, including messages you sent
    elif name == "message.ack":
        print(f"Message {payload.get('id')} ack: {payload.get('ackName')} ({payload.get('ack')})")
        # TODO: Update delivery/read status
    elif name == "message.reaction":
        reaction = payload.get("reaction") or {}
        print(f"Reaction on {reaction.get('messageId')}: {reaction.get('text')}")
        # TODO: Store the reaction
    elif name == "session.status":
        print(f"Session {event.get('session')} status: {payload.get('status')}")
        # TODO: On SCAN_QR_CODE fetch the QR; alert on FAILED / STOPPED
    elif name == "group.v2.join":
        group = payload.get("group") or {}
        print(f"Joined group {group.get('subject')} ({group.get('id')})")
        # TODO: Register the group
    elif name == "presence.update":
        print(f"Presence in chat {payload.get('id')}: {payload.get('presences')}")
        # TODO: Update online/typing state
    else:
        print(f"Unhandled WAHA event: {name}")


@app.post("/webhooks/waha")
async def waha_webhook(
    request: Request,
    x_webhook_hmac: Optional[str] = Header(None),
    x_webhook_hmac_algorithm: Optional[str] = Header(None),
):
    secret = os.getenv("WAHA_WEBHOOK_HMAC_KEY")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    if not x_webhook_hmac:
        raise HTTPException(status_code=400, detail="Missing X-Webhook-Hmac header")

    # Raw bytes, whatever the content type - never re-serialize before verifying
    raw_body = await request.body()

    if not verify_waha_signature(raw_body, x_webhook_hmac, secret, x_webhook_hmac_algorithm or "sha512"):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Retries resend the same event: de-duplicate on event["id"] (evt_...)
    # or the X-Webhook-Request-Id header.
    handle_waha_event(event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
