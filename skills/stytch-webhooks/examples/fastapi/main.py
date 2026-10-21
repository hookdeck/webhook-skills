# Generated with: stytch-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Stytch Webhook Handler")


def stytch_event_type(body: Any) -> Optional[str]:
    """Stytch bodies carry source, object_type and action but no combined type field."""
    if not isinstance(body, dict):
        return None
    parts = [body.get("source"), body.get("object_type"), body.get("action")]
    if not all(isinstance(p, str) and p for p in parts):
        return None
    return ".".join(parts).lower()


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/stytch")
async def stytch_webhook(
    request: Request,
    svix_id: Optional[str] = Header(None),
    svix_timestamp: Optional[str] = Header(None),
    svix_signature: Optional[str] = Header(None),
):
    secret = os.environ.get("STYTCH_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not svix_id or not svix_timestamp or not svix_signature:
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # RAW body: verification needs the exact bytes Stytch (Svix) signed
    raw_body = await request.body()

    try:
        # Checks HMAC-SHA256 over f"{svix-id}.{svix-timestamp}.{body}" against every
        # v1, signature and enforces the 5-minute timestamp window.
        Webhook(secret).verify(
            raw_body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError as err:
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = stytch_event_type(event)
    # svix-id is stable across retries: use it to deduplicate
    print(f"Received Stytch webhook {svix_id}: {event_type}")

    # Webhooks are unordered: treat them as a signal and re-fetch from the Stytch API
    if event_type == "direct.user.create":
        print("User created:", event.get("id"))
    elif event_type == "direct.user.update":
        print("User updated:", event.get("id"))
    elif event_type in ("direct.organization.create", "dashboard.organization.create"):
        print("Organization created:", event.get("id"))
    elif event_type in ("direct.member.update", "scim.member.update"):
        print("Member updated:", event.get("id"))
    elif event_type == "direct.saml_connection.delete":
        # DELETE events carry only the id, no entity object
        print("SAML connection deleted:", event.get("id"))
    else:
        print("Unhandled event type:", event_type)

    return {"success": True, "type": event_type}
