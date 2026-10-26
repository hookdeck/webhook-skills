# Generated with: scalekit-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Scalekit (scalekit.com) webhook receiver for FastAPI.

Scalekit signs webhooks with Standard Webhooks:
  webhook-id         the delivery ID (stable across retries)
  webhook-timestamp  Unix seconds when this attempt was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
"""

import logging
import os
from typing import Any, Dict, Mapping, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("scalekit-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Scalekit Webhook Handler")


# In-memory dedupe for the demo. Use Redis or your database in production.
# The top-level evt_ id (and webhook-id) is the same on every retry.
processed_event_ids: set = set()


def read_signature_headers(headers: Mapping[str, str]) -> Dict[str, Optional[str]]:
    """Read the signature headers.

    Standard Webhooks uses webhook-*; when webhook-id is absent, fall back to
    the svix-* names, as Hookdeck does. Returned under the webhook-* names the
    library expects.
    """
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


def verify_scalekit_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Scalekit delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body and compares in constant time against every `v1,` entry.
    Raises WebhookVerificationError on failure.
    """
    return Webhook(secret).verify(raw_body, headers)


async def verified_scalekit_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Scalekit event or raises."""
    secret = os.environ.get("SCALEKIT_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("SCALEKIT_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = read_signature_headers(request.headers)
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing Standard Webhooks signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        event = verify_scalekit_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Scalekit webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    return event


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type")
    data = event.get("data") or {}

    # --- Organizations -------------------------------------------------------
    if event_type in ("organization.created", "organization.updated", "organization.deleted"):
        logger.info("%s: %s (%s)", event_type, data.get("id"), data.get("display_name"))

    # --- Directory sync (SCIM) -----------------------------------------------
    elif event_type in ("organization.directory_enabled", "organization.directory_disabled"):
        logger.info("%s: %s", event_type, event.get("organization_id"))
    elif event_type in ("organization.directory.user_created", "organization.directory.user_updated"):
        logger.info("%s: %s (%s, active=%s)", event_type, data.get("id"), data.get("email"), data.get("active"))
    elif event_type == "organization.directory.user_deleted":
        logger.info("Directory user deleted: %s (%s)", data.get("id"), data.get("email"))
    elif event_type in (
        "organization.directory.group_created",
        "organization.directory.group_updated",
        "organization.directory.group_deleted",
    ):
        logger.info("%s: %s (%s)", event_type, data.get("id"), data.get("display_name"))

    # --- SSO connections -----------------------------------------------------
    elif event_type in ("organization.sso_enabled", "organization.sso_disabled"):
        logger.info("%s: %s", event_type, event.get("organization_id"))

    # --- Users (no organization_id on user.* events) -------------------------
    elif event_type in (
        "user.signup",
        "user.login",
        "user.logout",
        "user.organization_membership_created",
        "user.organization_membership_updated",
        "user.organization_membership_deleted",
    ):
        logger.info("%s: %s", event_type, data.get("id") or (data.get("user") or {}).get("id"))

    # --- Roles ---------------------------------------------------------------
    elif event_type in ("role.created", "role.updated"):
        logger.info("%s: %s", event_type, data.get("name") or data.get("id"))

    else:
        # Scalekit's event list may grow: acknowledge, don't fail.
        logger.info("Unhandled Scalekit event type: %s", event_type)

@app.post("/webhooks/scalekit")
async def scalekit_webhook(request: Request, event: Dict[str, Any] = Depends(verified_scalekit_event)):
    # Retries reuse the same event id and webhook-id; acknowledge duplicates with 200.
    event_id = event.get("id") or request.headers.get("webhook-id") or request.headers.get("svix-id")
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # Scalekit needs a 2xx within 30 seconds. In production, enqueue the event
        # here and process it asynchronously. Deliveries are unordered: compare
        # event["occurred_at"] before overwriting newer data.
        handle_event(event)
        processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling Scalekit event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
