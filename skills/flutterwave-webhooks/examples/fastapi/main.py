# Generated with: flutterwave-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Flutterwave webhook receiver for FastAPI.

Flutterwave has two webhook schemes, both still supported:
  v4  flutterwave-signature = base64(HMAC-SHA256(key = secret hash, raw body))
  v3  verif-hash            = the secret hash itself (no signature)
If flutterwave-signature is present, verify v4 and don't fall back to v3.

Flutterwave's v4 docs contradict themselves: the "Sample hashing" helper signs
the raw body, but later framework examples compare the header to the secret
hash directly. This follows the HMAC helper.
"""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
from typing import Any, Dict, Mapping, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("flutterwave-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Flutterwave Webhook Handler")

# In-memory dedupe for the demo. Use Redis or your database in production.
processed_keys: set = set()


def verify_flutterwave_webhook(
    raw_body: bytes, headers: Mapping[str, str], secret_hash: Optional[str]
) -> Optional[str]:
    """Return 'v4' or 'v3' for the scheme that verified, or None."""
    if not secret_hash:
        return None

    signature = headers.get("flutterwave-signature")
    if signature:
        body = raw_body.encode() if isinstance(raw_body, str) else raw_body
        expected = hmac.new(secret_hash.encode("utf-8"), body, hashlib.sha256).digest()
        try:
            given = base64.b64decode(signature)
        except (binascii.Error, ValueError):
            return None
        return "v4" if hmac.compare_digest(given, expected) else None

    verif_hash = headers.get("verif-hash")
    if verif_hash and hmac.compare_digest(verif_hash.encode("utf-8"), secret_hash.encode("utf-8")):
        return "v3"
    return None


def dedupe_key(event: Dict[str, Any], raw_body: bytes) -> str:
    """The v4 webhook ID (the webhooks page calls it `id`, other v4 pages
    `webhook_id`); for v3, event + data.id + data.status as Flutterwave suggests;
    otherwise a hash of the body."""
    if event.get("type") and (event.get("webhook_id") or event.get("id")):
        return f"v4:{event.get('webhook_id') or event.get('id')}"
    data = event.get("data")
    if event.get("event") and isinstance(data, dict):
        return f"v3:{event['event']}:{data.get('id')}:{data.get('status')}"
    return "body:" + hashlib.sha256(raw_body).hexdigest()


def handle_event(event: Dict[str, Any]) -> None:
    name = event.get("type") or event.get("event")  # v4 uses `type`, v3 uses `event`
    data = event.get("data") or {}
    if name == "charge.completed":
        # Re-query the charge through the API before giving value.
        logger.info("Charge %s %s: %s %s", data.get("id"), data.get("status"), data.get("amount"), data.get("currency"))
    elif name in ("transfer.disburse", "transfer.completed"):  # v4, v3
        logger.info("Transfer %s %s", data.get("id"), data.get("status"))
    elif name == "transfer.reversal":
        logger.info("Transfer %s reversed", data.get("id"))
    elif name == "refund.completed":
        logger.info("Refund %s %s for charge %s", data.get("id"), data.get("status"), data.get("charge_id"))
    elif name == "subscription.cancelled":
        logger.info("Subscription cancelled for %s", (data.get("customer") or {}).get("email"))
    elif name is None:
        # Some v3 payloads have no event field: virtual card notifications and refunds.
        if "CardId" in event:
            logger.info("Virtual card %s: %s %s", event.get("CardId"), event.get("Type"), event.get("Status"))
        elif "AmountRefunded" in event:
            logger.info("Refund %s %s", event.get("id"), event.get("status"))
        else:
            logger.info("Flutterwave webhook without an event type")
    else:
        logger.info("Unhandled Flutterwave event: %s", name)


@app.post("/webhooks/flutterwave")
async def flutterwave_webhook(request: Request) -> Dict[str, Any]:
    secret_hash = os.environ.get("FLUTTERWAVE_SECRET_HASH")
    if not secret_hash:
        logger.error("FLUTTERWAVE_SECRET_HASH is not set: rejecting delivery")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw body: request.json() would re-serialise and break the HMAC.
    raw_body = await request.body()
    version = verify_flutterwave_webhook(raw_body, request.headers, secret_hash)
    if not version:
        # Flutterwave's samples return 401 for a bad signature.
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    key = dedupe_key(event, raw_body)
    if key in processed_keys:
        return {"received": True, "duplicate": True}

    # Respond within 60 seconds: verify, enqueue, return 200, work asynchronously.
    handle_event(event)
    processed_keys.add(key)
    # FastAPI returns 200: Flutterwave treats any other status as a failure.
    return {"received": True, "version": version}


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
