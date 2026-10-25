# Generated with: envoy-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Envoy webhook receiver.

ENVOY WEBHOOK VERIFICATION

X-Envoy-Signature is the base64 HMAC-SHA256 of the raw request body, keyed with
your Envoy app's client secret. There is no timestamp in the signed content.
"""

import base64
import hashlib
import hmac
import json
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI(title="Envoy Webhook Receiver")


def verify_envoy_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """base64(HMAC-SHA256(client secret, raw body)), compared in constant time."""
    if not signature or not secret:
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    # Compare bytes: str args to compare_digest must be ASCII, so a non-ASCII header would raise.
    return hmac.compare_digest(signature.encode("utf-8"), expected)


async def verified_envoy_body(request: Request) -> bytes:
    """FastAPI dependency: return the raw body only if the signature is valid."""
    secret = os.environ.get("ENVOY_CLIENT_SECRET")
    if not secret:
        print("ENVOY_CLIENT_SECRET is not set - refusing unverified webhooks")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("x-envoy-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Envoy-Signature header")

    # Raw bytes, whatever the Content-Type: read before any JSON parsing.
    raw_body = await request.body()
    if not verify_envoy_signature(raw_body, signature, secret):
        print("Envoy webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/envoy")
async def envoy_webhook(raw_body: bytes = Depends(verified_envoy_body)):
    try:
        payload = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event") if isinstance(payload, dict) else None
    print(f"Verified Envoy webhook: {event or 'unknown'}")

    handle_event(payload)
    return {"received": True}


def handle_event(payload: Any) -> None:
    # `event` is the topic; `payload` is the entry/invite/etc., `meta` has the location and company.
    # TODO: dedupe (e.g. on event + payload.id); Envoy retries failed deliveries.
    payload = payload if isinstance(payload, dict) else {}
    event = payload.get("event")
    data = payload.get("payload") or {}
    meta = payload.get("meta") or {}
    attrs = data.get("attributes") or {}
    who = attrs.get("full-name") or data.get("id")
    where = ((meta.get("location") or {}).get("attributes") or {}).get("name")

    # Visitors
    if event == "entry_sign_in":
        print(f"Visitor signed in: {who} at {where}")
    elif event == "entry_sign_out":
        print(f"Visitor signed out: {who} at {where}")
    elif event == "entry_blacklist_review":
        print(f"Visitor needs blocklist review: {who}")
    elif event == "entry_blacklist_deny":
        print(f"Visitor denied by blocklist: {who}")
    elif event == "entry_manually_updated":
        print(f"Entry manually updated: {who}")
    elif event == "invite_created":
        print(f"Invite created: {who}")
    elif event == "invite_updated":
        print(f"Invite updated: {who}")
    elif event == "invite_removed":
        print(f"Invite removed: {who}")
    elif event == "upcoming_visit":
        print(f"Upcoming visit: {who}")
    elif event == "qr_code_sent":
        print(f"QR code sent to: {who}")
    # Workplace
    elif event == "employee_invite_created":
        print(f"Employee invite created: {who}")
    elif event == "employee_invite_updated":
        print(f"Employee invite updated: {who}")
    elif event == "employee_upcoming_visit":
        print(f"Employee arriving within the hour: {who}")
    elif event == "employee_entry_sign_in":
        print(f"Employee signed in: {who} at {where}")
    elif event == "employee_entry_sign_out":
        print(f"Employee signed out: {who} at {where}")
    elif event == "employee_entry_blacklist_review":
        print(f"Employee needs blocklist review: {who}")
    elif event == "employee_entry_blacklist_deny":
        print(f"Employee denied by blocklist: {who}")
    elif event == "location_capacity_updated":
        print(f"Location capacity updated: {where}")
    elif event == "desk_sign_in":
        print(f"Desk sign-in: {who}")
    elif event == "ticket_created":
        print(f"Workplace ticket created: {data.get('id')}")
    else:
        print(f"Unhandled Envoy event: {event}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
