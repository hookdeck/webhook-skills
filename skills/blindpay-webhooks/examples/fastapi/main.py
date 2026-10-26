# Generated with: blindpay-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""BlindPay webhook receiver for FastAPI.

BlindPay delivers webhooks through Svix:
  svix-id         message ID (stable across retries)
  svix-timestamp  Unix seconds when the message was sent
  svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
Signed content: f"{svix-id}.{svix-timestamp}.{raw_body}"
Key: base64-decode of the secret after its `whsec_` prefix.
"""

import json
import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

logger = logging.getLogger("blindpay-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="BlindPay Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# svix-id is the same on every retry of a message.
processed_message_ids: set = set()


def verify_blindpay_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a BlindPay delivery with the official Svix library.

    Svix checks the timestamp (fixed 5-minute window), recomputes the HMAC over
    the raw body, and compares in constant time against every `v1,` entry.

    The 5-minute window also rejects late Hookdeck retries and replays, which
    keep the original timestamp. See references/verification.md for a manual
    verifier without the window.

    svix 2.x `verify()` returns None (it raises on failure), so the JSON is
    parsed here afterwards.
    """
    Webhook(secret).verify(raw_body, headers)
    return json.loads(raw_body)


async def verified_blindpay_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified BlindPay event or raises."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    secret = os.environ.get("BLINDPAY_WEBHOOK_SECRET")
    if not secret:
        logger.error("BLINDPAY_WEBHOOK_SECRET is not set — rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=400, detail="Missing Svix signature headers")

    # Raw body: the signature covers the exact bytes, so never verify request.json().
    raw_body = await request.body()
    try:
        event = verify_blindpay_webhook(raw_body, headers, secret)
    except (WebhookVerificationError, ValueError) as err:
        logger.warning("BlindPay webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")
    event["_svix_id"] = headers["svix-id"]
    return event


def handle_event(event: Dict[str, Any]) -> None:
    # The body is flat: `webhook_event` plus the resource's own fields.
    event_type = event.get("webhook_event")
    resource_id = event.get("id")

    # --- Customers -----------------------------------------------------------
    if event_type in ("customer.new", "customer.update", "customer.delete"):
        logger.info("%s: customer %s (%s)", event_type, resource_id, event.get("kyc_status") or event.get("status") or "n/a")
    elif event_type == "tos.accept":
        logger.info("Terms of service accepted: %s", resource_id)

    # --- Bank accounts and wallets ---------------------------------------------
    elif event_type == "bankAccount.new":
        logger.info("Bank account added: %s", resource_id)
    elif event_type in ("blockchainWallet.new", "blockchainWallet.update", "wallet.new", "wallet.update"):
        logger.info("%s: %s", event_type, resource_id)
    elif event_type == "wallet.inbound":
        # Funds arrived in a wallet.
        logger.info("Inbound wallet funds: %s", resource_id)

    # --- Payins ----------------------------------------------------------------
    elif event_type in ("payin.new", "payin.update"):
        logger.info("%s: payin %s is %s", event_type, resource_id, event.get("status"))
    elif event_type == "payin.complete":
        # Carries amounts, fees, bank details and tracking objects.
        logger.info("Payin completed: %s for customer %s", resource_id, event.get("customer_id"))

    # --- Payouts ---------------------------------------------------------------
    elif event_type in ("payout.new", "payout.update"):
        logger.info("%s: payout %s is %s", event_type, resource_id, event.get("status"))
    elif event_type == "payout.complete":
        logger.info("Payout completed: %s", resource_id)

    # --- Virtual accounts --------------------------------------------------------
    elif event_type in ("virtualAccount.new", "virtualAccount.complete"):
        logger.info("%s: %s", event_type, resource_id)

    # --- Transfers ---------------------------------------------------------------
    elif event_type in ("transfer.new", "transfer.update", "transfer.complete"):
        logger.info("%s: transfer %s is %s", event_type, resource_id, event.get("status"))

    # --- Limit increases and payables ------------------------------------------
    elif event_type in (
        "limitIncrease.new",
        "limitIncrease.update",
        "payable.new",
        "payable.update",
        "payable.complete",
    ):
        logger.info("%s: %s", event_type, resource_id)

    else:
        logger.info("Unhandled BlindPay event type: %s", event_type)


@app.post("/webhooks/blindpay")
async def blindpay_webhook(event: Dict[str, Any] = Depends(verified_blindpay_event)):
    message_id = event.pop("_svix_id")

    # Duplicates are normal (retries reuse svix-id) — acknowledge with 200.
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # Keep this fast. In production, enqueue the event and process it asynchronously.
        handle_event(event)
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling BlindPay event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
