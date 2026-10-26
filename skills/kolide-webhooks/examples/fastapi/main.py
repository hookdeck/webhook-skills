# Generated with: kolide-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import re
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# 1Password Device Trust (Kolide) sends the signature in the Authorization header as a BARE
# lowercase hex digest: no "Bearer", no prefix, no timestamp.
#   Authorization: hex( HMAC-SHA256( endpoint secret as UTF-8 bytes, raw request body ) )
# Only the body is signed, so there is no replay window to check.
# https://support.1password.com/device-trust-webhooks/

_HEX_64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_kolide(raw_body: bytes, authorization: Optional[str], secret: str) -> bool:
    if not secret or authorization is None:
        return False
    received = authorization.strip()
    # Exactly 64 hex chars (ASCII only), compared case-insensitively like Hookdeck does
    if not _HEX_64.fullmatch(received):
        return False
    expected = hmac.new(
        secret.encode("utf-8"),  # secret string used as-is: not hex/base64 decoded
        raw_body,  # raw bytes exactly as received
        hashlib.sha256,
    ).hexdigest()
    # bytes on both sides: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(received.lower().encode(), expected.encode())


# Parsed JSON is untrusted: only read fields after checking their type.
def obj(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def text(value: Any) -> Optional[str]:
    # bool is an int subclass; a JSON true/false is not a useful id or name
    if isinstance(value, bool):
        return None
    return str(value) if isinstance(value, (str, int, float)) else None


@app.post("/webhooks/kolide")
async def kolide_webhook(request: Request):
    secret = os.environ.get("KOLIDE_WEBHOOK_SECRET")
    if not secret:
        print("KOLIDE_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes: the signature covers the exact body Kolide sent, whatever the Content-Type.
    raw_body = await request.body()
    if not verify_kolide(raw_body, request.headers.get("authorization"), secret):
        print("Kolide webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict) or not isinstance(event.get("event"), str):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Envelope: { event, id, timestamp, data }. Dispatch on `event`; dedupe on `id`.
    name = event["event"]
    data = obj(event.get("data"))

    if name == "webhook.test":
        print("Test webhook received")
    elif name == "devices.created":
        print(f"Device created: {text(data.get('device_name'))} (id {text(data.get('device_id'))})")
    elif name == "devices.registered":
        owner = obj(data.get("registered_owner"))
        print(f"Device registered: {text(data.get('device_name'))} by {text(owner.get('email'))}")
    elif name == "devices.destroyed":
        print(f"Device destroyed: {text(data.get('device_name'))} (id {text(data.get('device_id'))})")
    elif name == "device_trust.status_changed":
        print(f"Device {text(data.get('device_name'))} is now {text(data.get('device_status'))}")
    elif name in ("issues.new", "issues.resolved"):
        device = obj(data.get("device"))
        check = obj(data.get("check"))
        print(f"{name}: {text(check.get('name'))} on {text(device.get('name'))}")
    elif name in ("auth_logs.success", "auth_logs.failure"):
        print(f"{name}: {text(data.get('device_name'))} via {text(data.get('browser_name'))}")
    elif name == "audit_log.recorded":
        print(f"Audit log: {text(data.get('actor_name'))}: {text(data.get('description'))}")
    else:
        # admin_users.created, requests.issue_exemption, requests.registration, ...
        print(f"Unhandled event: {name}")

    return {"received": True}
