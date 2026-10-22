# Generated with: stigg-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI(title="Stigg Webhook Handler")


def verify_stigg_secret(header: Optional[str], secret: Optional[str]) -> bool:
    """
    Verify a Stigg webhook.

    Stigg does NOT sign payloads yet (HMAC is on its roadmap). Each event carries
    the webhook secret in the `Stigg-Webhooks-Secret` header; it must match the
    secret on the webhook details page. Both sides are hashed so the
    comparison is constant-time regardless of length.
    """
    if not header or not secret:
        return False
    return hmac.compare_digest(
        hashlib.sha256(header.encode()).digest(),
        hashlib.sha256(secret.encode()).digest(),
    )


def require_stigg_secret(stigg_webhooks_secret: Optional[str] = Header(None)) -> None:
    """FastAPI dependency that authenticates the Stigg webhook request."""
    secret = os.getenv("STIGG_WEBHOOK_SECRET")

    # Fail closed: without a configured secret there is nothing to check.
    if not secret:
        print("STIGG_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook authentication not configured")

    if not verify_stigg_secret(stigg_webhooks_secret, secret):
        print("Stigg webhook authentication failed")
        raise HTTPException(status_code=401, detail="Unauthorized")


def handle_stigg_event(event: Dict[str, Any]) -> None:
    # The event name is in `type`; `messageId` is unique per event (use it to de-duplicate)
    event_type = event.get("type")

    if event_type == "customer.created":
        print(f"Customer created: {event.get('id')}")
        # TODO: Create CRM record / billing profile
    elif event_type == "customer.updated":
        print(f"Customer updated: {event.get('id')}")
    elif event_type == "customer.deleted":
        print(f"Customer deleted: {event.get('id')}")
    elif event_type == "customer.payment_failed":
        print(f"Payment failed for customer: {(event.get('customer') or {}).get('id')}")
        # TODO: Start dunning
    elif event_type == "subscription.created":
        plan = event.get("plan") or {}
        print(f"Subscription created: {event.get('id')} ({plan.get('id')})")
        # TODO: Provision access
    elif event_type == "subscription.updated":
        print(f"Subscription updated: {event.get('id')}")
    elif event_type in ("subscription.canceled", "subscription.expired"):
        print(f"{event_type}: {event.get('id')}")
        # TODO: Schedule offboarding / revoke access
    elif event_type in (
        "subscription.trial_started",
        "subscription.trial_converted",
        "subscription.trial_expired",
        "subscription.trial.ends_soon",
    ):
        print(f"Trial event {event_type}: {event.get('id')}")
    elif event_type == "entitlements.updated":
        customer = event.get("customer") or {}
        print(f"Entitlements updated for customer: {customer.get('id')}")
        # TODO: Recompute access gates
    elif event_type == "entitlement.usage_exceeded":
        print(f"Entitlement usage exceeded: {event.get('messageId')}")
    else:
        print(f"Unhandled Stigg event: {event_type}")


@app.post("/webhooks/stigg", dependencies=[Depends(require_stigg_secret)])
async def handle_stigg_webhook(request: Request):
    """Receive Stigg webhook events (any content type; JSON parsed from the raw body)."""
    try:
        event = json.loads(await request.body())
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict) or not isinstance(event.get("type"), str):
        raise HTTPException(status_code=400, detail="Invalid payload")

    handle_stigg_event(event)

    # Respond 2xx within 30 seconds; Stigg retries on errors and timeouts
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
