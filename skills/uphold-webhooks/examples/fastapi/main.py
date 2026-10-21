# Generated with: uphold-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Uphold Enterprise (Core API) webhook receiver for FastAPI.

Uphold webhooks are delivered by Svix, white-labelled:
  webhook-id         unique message id (same value on every retry)
  webhook-timestamp  Unix seconds when the delivery was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the endpoint secret after its `whsec_` prefix.
Uphold defers to Svix's verification guide, so we use the official `svix`
SDK, which accepts the unbranded webhook-* header names directly.
"""

import json
import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from svix.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("uphold-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Uphold Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production —
# Svix delivers at least once and retries failed deliveries for up to 24 hours.
processed_event_ids: set = set()


def verify_uphold_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify an Uphold delivery, then parse it.

    The SDK checks the timestamp (5-minute tolerance), recomputes the HMAC
    over the raw body, and compares in constant time against every `v1,`
    entry in webhook-signature. In svix 2.x `Webhook.verify()` returns None
    (it only raises), so parse the raw body once verification has passed.
    """
    Webhook(secret).verify(raw_body, headers)
    return json.loads(raw_body)


async def verified_uphold_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified Uphold event or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("UPHOLD_WEBHOOK_SECRET")
    if not secret:
        logger.error("UPHOLD_WEBHOOK_SECRET is not set — rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "webhook-id": request.headers.get("webhook-id"),
        "webhook-timestamp": request.headers.get("webhook-timestamp"),
        "webhook-signature": request.headers.get("webhook-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # Raw body — request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        return verify_uphold_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, bad JSON
        logger.error("Uphold webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")


def handle_event(event: Dict[str, Any]) -> None:
    event_type = event.get("type") or ""
    data = event.get("data") or {}

    # --- Users ---------------------------------------------------------------
    if event_type == "core.user.created":
        user = data["user"]
        logger.info("User created: %s (%s)", user["id"], user.get("type"))
    elif event_type == "core.user.deleted":
        logger.info("User deleted: %s", data["user"]["id"])

    # --- Transactions --------------------------------------------------------
    elif event_type == "core.transaction.created":
        tx = data["transaction"]
        logger.info("Transaction created: %s (%s)", tx["id"], tx.get("status"))
    elif event_type == "core.transaction.status-changed":
        tx = data["transaction"]
        status = tx.get("status")  # processing | on-hold | completed | failed
        if status == "completed":
            destination = tx.get("destination") or {}
            logger.info(
                "Transaction %s completed: %s %s",
                tx["id"],
                destination.get("amount"),
                destination.get("asset"),
            )
        elif status in ("failed", "on-hold"):
            reason = (tx.get("statusDetails") or {}).get("reason")
            logger.info("Transaction %s %s (reason=%s)", tx["id"], status, reason)
        else:
            logger.info("Transaction %s -> %s", tx["id"], status)

    # --- Accounts ------------------------------------------------------------
    elif event_type in ("core.account.created", "core.account.archived", "core.account.unarchived"):
        account = data["account"]
        logger.info("%s: account %s (%s)", event_type, account["id"], account.get("asset"))
    elif event_type == "core.account.balance-changed":
        account = data["account"]
        balance = account.get("balance") or {}
        logger.info(
            "Account %s balance: %s available / %s total %s",
            account["id"],
            balance.get("available"),
            balance.get("total"),
            account.get("asset"),
        )

    # --- External accounts (cards, banks, APMs, crypto) ----------------------
    elif event_type in ("core.external-account.created", "core.external-account.deleted"):
        logger.info("%s: external account %s", event_type, data["externalAccount"]["id"])
    elif event_type == "core.external-account.status-changed":
        external_account = data["externalAccount"]
        logger.info(
            "External account %s -> %s", external_account["id"], external_account.get("status")
        )

    # --- Assets --------------------------------------------------------------
    elif event_type == "core.assets.cooldown-ended":
        logger.info("Cooldown ended for user %s", data.get("userId"))

    # KYC / KYB process events share one shape: {status, userId} (plus
    # associatedPersonId for associated-person events).
    # status: ok | failed | running | pending | exempt
    elif event_type.startswith(("core.kyc.", "core.kyb.")):
        logger.info("%s: user %s -> %s", event_type, data.get("userId"), data.get("status"))

    else:
        logger.info("Unhandled Uphold event type: %s", event_type)


@app.post("/webhooks/uphold")
async def uphold_webhook(event: Dict[str, Any] = Depends(verified_uphold_event)):
    # Dedupe on the Uphold event id (payload `id`). Retries also reuse the
    # webhook-id header, so either works as an idempotency key.
    event_id = event.get("id")
    if event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        # Keep this fast. In production, enqueue the event and process it
        # asynchronously so slow work doesn't cause timeouts and retries.
        handle_event(event)
        processed_event_ids.add(event_id)
    except Exception:
        logger.exception("Error handling Uphold event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
