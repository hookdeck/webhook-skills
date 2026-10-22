# Generated with: descope-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_descope_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Descope signs the exact JSON string it sends: HMAC-SHA256, base64 encoded."""
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    try:
        received = base64.b64decode(signature_header, validate=True)
    except (binascii.Error, ValueError):
        return False
    return hmac.compare_digest(received, expected)


@app.post("/webhooks/descope")
async def descope_webhook(
    request: Request,
    x_descope_webhook_s256: str = Header(None),
):
    secret = os.getenv("DESCOPE_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    if not x_descope_webhook_s256:
        raise HTTPException(status_code=400, detail="Missing x-descope-webhook-s256 header")

    # Raw body: read bytes before any JSON parsing
    raw_body = await request.body()
    if not verify_descope_signature(raw_body, x_descope_webhook_s256, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        events = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    # The connector posts a JSON array of up to 100 audit events
    if not isinstance(events, list):
        events = [events]

    for event in events:
        action = event.get("action")
        if action == "LoginSucceed":
            print(f"Login succeeded for {', '.join(event.get('loginIds') or [])}")
        elif action == "LoginFailed":
            print(f"Login failed: {(event.get('data') or {}).get('error_message')}")
        elif action == "UserCreated":
            print(f"User created: {event.get('userId')}")
        elif action == "UserModified":
            print(f"User modified: {event.get('userId')}")
        elif action == "UserDeleted":
            print(f"User deleted: {event.get('userId')}")
        elif action == "Change Password":  # some actions contain a literal space
            print(f"Password changed for user {event.get('userId')}")
        else:
            print(f"Unhandled Descope audit event: {action}")

    return {"received": True, "count": len(events)}
