# Generated with: strike-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Strike (strike.me) webhook receiver for FastAPI.

Strike, the Bitcoin/Lightning payments platform, signs every webhook with
X-Webhook-Signature: the lowercase hex HMAC-SHA256 of the raw request body, keyed
with the `secret` YOU chose when creating the subscription (POST /v1/subscriptions).
Not the API key. No timestamp, no prefix.
"""

import hashlib
import hmac
import json
import logging
import os
import re
from typing import Any, Dict, Iterable, List, Optional, Set, Union
from urllib.parse import quote

import httpx
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("strike-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Strike Webhook Handler")

# SHA-256 is 32 bytes: 64 hex characters.
_HEX64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_strike_signature(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    secrets: Iterable[str],
) -> bool:
    """Verify X-Webhook-Signature against the exact bytes Strike sent."""
    value = (signature or "").strip()
    if not _HEX64.fullmatch(value):
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    received = bytes.fromhex(value)
    return any(
        hmac.compare_digest(received, hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest())
        for secret in secrets
    )


def configured_secrets() -> List[str]:
    """Current secret, plus the previous one while you rotate it."""
    names = ("STRIKE_WEBHOOK_SECRET", "STRIKE_WEBHOOK_SECRET_PREVIOUS")
    return [v for v in (os.environ.get(n, "") for n in names) if v]


# The 14 event types in Strike's "Supported Events" table, mapped to the API
# path that resolves data.entityId. Webhooks carry no entity data: fetch it.
EVENT_RESOURCES: Dict[str, str] = {
    "invoice.created": "/v1/invoices",
    "invoice.updated": "/v1/invoices",
    "payment-method.bank.created": "/v1/payment-methods/bank",
    "payment-method.bank.updated": "/v1/payment-methods/bank",
    "payout.created": "/v1/payouts",
    "payout.updated": "/v1/payouts",
    "payout-originator.created": "/v1/payout-originators",
    "payout-originator.updated": "/v1/payout-originators",
    "currency-exchange-quote.updated": "/v1/currency-exchange-quotes",
    "payment.created": "/v1/payments",
    "payment.updated": "/v1/payments",
    "deposit.updated": "/v1/deposits",
    "receive-request.receive-pending": "/v1/receive-requests",
    "receive-request.receive-completed": "/v1/receive-requests",
}

# Demo-only dedupe store. Use a database unique constraint on event id in production.
seen_event_ids: Set[str] = set()


def fetch_strike_entity(path: str, api_key: str) -> Any:
    base = os.environ.get("STRIKE_API_BASE", "https://api.strike.me")
    response = httpx.get(
        f"{base}{path}",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


def process_event(event: Dict[str, Any]) -> Any:
    """Runs AFTER the response (BackgroundTasks). Strike cancels a delivery after
    5 seconds, so the fetch-back API call must never happen before responding."""
    base_path = EVENT_RESOURCES.get(event.get("eventType", ""))
    data = event.get("data") or {}
    entity_id = data.get("entityId")
    if not base_path or not entity_id:
        return None

    api_key = os.environ.get("STRIKE_API_KEY", "")
    if not api_key:
        logger.error("STRIKE_API_KEY is not set: cannot fetch the entity for %s", event.get("id"))
        return None

    try:
        entity = fetch_strike_entity(f"{base_path}/{quote(str(entity_id), safe='')}", api_key)
    except Exception:
        logger.exception("Strike fetch-back failed for %s %s", event.get("eventType"), entity_id)
        return None

    # The fetched entity is the source of truth. Deliveries can repeat and arrive
    # out of order, so don't rebuild state from the sequence of events.
    changes = data.get("changes") or []  # only on *.updated events
    logger.info("%s %s changed %s: %s", event.get("eventType"), entity_id, changes, entity)
    return entity


@app.post("/webhooks/strike")
async def strike_webhook(request: Request, background_tasks: BackgroundTasks):
    secrets = configured_secrets()
    if not secrets:
        # Fail closed: never skip verification because the secret is missing.
        logger.error("STRIKE_WEBHOOK_SECRET is not set: rejecting webhook")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=401)

    # Read the raw bytes: the HMAC covers the exact body Strike sent.
    raw_body = await request.body()
    if not verify_strike_signature(raw_body, request.headers.get("x-webhook-signature"), secrets):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(event, dict) or not isinstance(event.get("id"), str):
        return JSONResponse({"error": "Not a Strike webhook event"}, status_code=400)

    event_id = event["id"]
    event_type = event.get("eventType")

    # Only the v1 payload is documented. Make a version change loud, not silent.
    # The event stays recoverable via GET /v1/events for 30 days.
    if event.get("webhookVersion") != "v1":
        logger.error("Unsupported webhookVersion %s on event %s", event.get("webhookVersion"), event_id)
        return {"received": True, "id": event_id, "ignored": "unsupported webhookVersion"}

    if event_id in seen_event_ids:
        return {"received": True, "id": event_id, "duplicate": True}
    seen_event_ids.add(event_id)

    if event_type not in EVENT_RESOURCES:
        # Strike can add event types within v1 without notice: acknowledge, don't 4xx.
        logger.info("Ignoring unknown Strike eventType %s", event_type)
        return {"received": True, "id": event_id, "ignored": "unknown eventType"}

    # Respond first (5-second timeout); the fetch-back runs after the response is sent.
    background_tasks.add_task(process_event, event)
    return {"received": True, "id": event_id, "eventType": event_type}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
