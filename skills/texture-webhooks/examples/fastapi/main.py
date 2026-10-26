# Generated with: texture-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Exactly 64 hex characters. fullmatch, so a trailing newline or junk is rejected.
_HEX64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_texture_signature(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    """Texture-Signature is the lowercase hex HMAC-SHA256 of the raw body, keyed with the
    destination secret (UTF-8 bytes, used as-is, whsec_ prefix included). Nothing else is signed."""
    if not secret or not signature or not _HEX64.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes, not str: compare_digest raises TypeError on a non-ASCII str.
    return hmac.compare_digest(expected.encode("ascii"), signature.lower().encode("ascii"))


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body (any content type) and reject it unless the signature is valid."""
    raw_body = await request.body()
    signature = request.headers.get("texture-signature")
    if not verify_texture_signature(raw_body, signature, os.getenv("TEXTURE_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


def handle_event(event: dict) -> None:
    event_type = event.get("type")
    device_id = event.get("deviceId")

    if event_type == "device.discovered":
        print(f"Device discovered: {device_id}")
        # TODO: register the device in your system
    elif event_type == "device.updated":
        print(f"Device updated: {device_id}")
        # TODO: sync device state
    elif event_type == "device.disconnected":
        print(f"Device disconnected: {device_id}")
    elif event_type == "command.succeeded":
        print(f"Command succeeded for device {device_id}")
    elif event_type == "command.failed":
        print(f"Command failed for device {device_id}")
        # TODO: retry or alert
    elif event_type == "command.overridden":
        print(f"Command overridden for device {device_id}")
    elif event_type == "customer.created":
        print("Customer created")
    elif event_type == "enrollment.approved":
        print("Enrollment approved")
    elif event_type == "site.created":
        print("Site created")
    else:
        print(f"Unhandled Texture event type: {event_type}")


@app.post("/webhooks/texture")
async def texture_webhook(raw_body: bytes = Depends(verified_body)):
    # Parse only after the signature check.
    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    # Events can arrive out of order and be retried: dedupe on event["key"] before side effects.
    try:
        handle_event(event)
    except Exception as exc:  # noqa: BLE001
        print(f"Error handling Texture webhook: {exc}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
