# Generated with: requesty-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Requesty webhook receiver for FastAPI.

Requesty delivers webhooks with Standard Webhooks signatures:
  webhook-id         unique message ID (alert `id`, or sample `request_id`);
                     the same on every retry
  webhook-timestamp  Unix seconds when the webhook was sent
  webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
Signed content: f"{webhook-id}.{webhook-timestamp}.{raw_body}"
Key: base64-decode of the organisation's secret after its `whsec_` prefix.
There is one signing secret per organisation (Admin Panel > Alerts); during a
rotation grace period webhook-signature carries several v1 entries.
Until the organisation has a secret, deliveries are unsigned and fail here.
Hookdeck's Requesty source also accepts the svix-* header names when webhook-id
is absent, so this handler does the same.
"""

import logging
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

logger = logging.getLogger("requesty-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Requesty Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
# webhook-id is the same on every retry (only the timestamp and signature change).
processed_message_ids: set = set()


def resolve_signature_headers(headers) -> Optional[Dict[str, str]]:
    """Read the three signature headers: webhook-* first, svix-* when
    webhook-id is absent. Returns them under the webhook-* names the library
    expects, or None if any is missing."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    msg_id = headers.get(f"{prefix}-id")
    timestamp = headers.get(f"{prefix}-timestamp")
    signature = headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        return None
    return {
        "webhook-id": msg_id,
        "webhook-timestamp": timestamp,
        "webhook-signature": signature,
    }


def verify_requesty_webhook(raw_body: bytes, headers: Dict[str, str], secret: str) -> Dict[str, Any]:
    """Verify a Requesty delivery with the Standard Webhooks library.

    It checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
    over the raw body, and compares in constant time against every `v1,`
    entry. Raises WebhookVerificationError on failure and returns the parsed
    JSON body on success.
    """
    return Webhook(secret).verify(raw_body, headers)


def event_type_of(header_value: Optional[str], body: Dict[str, Any]) -> str:
    """The event name. X-Requesty-Event is the only carrier both alerts and
    sample requests share; alert bodies also carry a top-level `type` with the
    same value, the sample-request body has none."""
    return header_value or body.get("type") or "unknown"


async def verified_requesty_delivery(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: returns the verified delivery or raises."""
    secret = os.environ.get("REQUESTY_WEBHOOK_SECRET")
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not secret:
        logger.error("REQUESTY_WEBHOOK_SECRET is not set; rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    headers = resolve_signature_headers(request.headers)
    if headers is None:
        raise HTTPException(status_code=400, detail="Missing signature headers")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()

    try:
        body = verify_requesty_webhook(raw_body, headers, secret)
    except Exception as err:  # WebhookVerificationError, bad base64, etc.
        logger.error("Requesty webhook verification failed: %s", err)
        raise HTTPException(status_code=400, detail="Invalid signature")

    return {
        "message_id": headers["webhook-id"],
        "event_type": event_type_of(request.headers.get("x-requesty-event"), body),
        "body": body,
    }


def handle_event(event_type: str, body: Dict[str, Any]) -> None:
    d = body.get("data") or {}

    # --- Spending alerts: {id, type, data} -----------------------------------
    if event_type == "user.budget.exceeded_percent":
        logger.info(
            "User %s (%s) reached %s%% of their $%s budget (spend $%s)",
            d.get("user_email"), d.get("user_id"), _pct(d), d.get("limit"), d.get("spend"),
        )
    elif event_type == "user.budget.exceeded_absolute":
        logger.info(
            "User %s (%s) passed the $%s spend threshold (spend $%s)",
            d.get("user_email"), d.get("user_id"), d.get("absolute_exceeded"), d.get("spend"),
        )
    elif event_type == "group.budget.exceeded_percent":
        logger.info(
            "Group %s (%s) reached %s%% of its $%s budget (spend $%s)",
            d.get("group_name"), d.get("group_id"), _pct(d), d.get("limit"), d.get("spend"),
        )
    elif event_type == "org.balance.below_absolute":
        logger.info(
            "Organisation %s balance $%s is below $%s",
            d.get("org_id"), d.get("current_balance"), d.get("balance_threshold"),
        )
    elif event_type == "apikey.budget.exceeded_percent":
        logger.info(
            "API key %s (%s) reached %s%% of its $%s budget (spend $%s)",
            d.get("api_key_name"), d.get("api_key_id"), _pct(d), d.get("limit"), d.get("spend"),
        )
    elif event_type == "apikey.budget.exceeded_absolute":
        logger.info(
            "API key %s (%s) passed the $%s spend threshold (spend $%s)",
            d.get("api_key_name"), d.get("api_key_id"), d.get("absolute_exceeded"), d.get("spend"),
        )

    # --- Sample requests: {request_id, request, response} (no `type`) --------
    elif event_type == "sample.request":
        logger.info(
            "Sampled request %s (model %s, tokens %s)",
            body.get("request_id"),
            (body.get("request") or {}).get("model"),
            ((body.get("response") or {}).get("usage") or {}).get("total_tokens"),
        )

    else:
        # The documented list may not be exhaustive.
        logger.info("Unhandled Requesty event type: %s", event_type)


def _pct(data: Dict[str, Any]) -> Any:
    """percentage_exceeded is a fraction string such as "0.8"; show it as 80."""
    try:
        return round(float(data.get("percentage_exceeded")) * 100)
    except (TypeError, ValueError):
        return data.get("percentage_exceeded")


@app.post("/webhooks/requesty")
async def requesty_webhook(delivery: Dict[str, Any] = Depends(verified_requesty_delivery)):
    # Delivery is retried (up to 3 times), so acknowledge duplicates with 200.
    message_id = delivery["message_id"]
    if message_id in processed_message_ids:
        return {"received": True, "duplicate": True}

    try:
        # Requesty times out after 15 seconds per attempt. In production,
        # enqueue the event here and process it asynchronously.
        handle_event(delivery["event_type"], delivery["body"])
        processed_message_ids.add(message_id)
    except Exception:
        logger.exception("Error handling Requesty event")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
