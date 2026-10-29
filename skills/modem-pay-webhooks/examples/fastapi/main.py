# Generated with: modem-pay-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("modem-pay-webhooks")
app = FastAPI()

# Modem Pay signs every delivery:
#   x-modem-signature: <hex>
# <hex> = HMAC-SHA512 of the request body, keyed with the webhook secret (Developers > Webhooks in
# the Modem Pay dashboard) used as-is. There is no timestamp and no prefix such as "sha512=".
# https://docs.modempay.com/documentation/core/webhooks#webhook-security-and-signature-validation
#
# Hash the RAW body bytes. Modem Pay's Flask snippet hashes json.dumps(request.json), whose
# separators differ from the JSON the sender produced, so it can reject genuine deliveries.
_HEX_128 = re.compile(r"[0-9a-fA-F]{128}")


def verify_modem_pay(raw_body: bytes, signature_header: Optional[str], secret: str) -> bool:
    if not secret or not signature_header:
        return False
    signature = signature_header.strip()
    # 128 hex characters (case-insensitive) before comparing; compare bytes, never str
    if not _HEX_128.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha512).hexdigest().encode()
    return hmac.compare_digest(signature.lower().encode(), expected)


async def verified_body(request: Request) -> bytes:
    """Dependency: read the raw body and verify it before any JSON parsing."""
    secret = os.getenv("MODEM_PAY_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("MODEM_PAY_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()
    if not verify_modem_pay(raw_body, request.headers.get("x-modem-signature"), secret):
        logger.error("Modem Pay webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Unauthorized")
    return raw_body


def _str(x: Any) -> Optional[str]:
    return x if isinstance(x, str) else None


@app.post("/webhooks/modem-pay")
async def modem_pay_webhook(raw_body: bytes = Depends(verified_body)):
    # Verified. Now parse, and treat every field as untrusted until its type is checked.
    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError, RecursionError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if (
        not isinstance(event, dict)
        or not isinstance(event.get("event"), str)
        or not isinstance(event.get("payload"), dict)
    ):
        raise HTTPException(status_code=400, detail='Expected {"event": string, "payload": object}')

    event_type = event["event"]
    payload = event["payload"]
    # There is no delivery id: dedupe retries on (event, payload.id), e.g. in a unique DB index.
    ref = _str(payload.get("id")) or "(no id)"

    if event_type == "charge.succeeded":
        logger.info("Charge succeeded: %s %s %s", ref, payload.get("amount"), _str(payload.get("currency")) or "")
        # TODO: mark the order paid (check payload.test_mode before fulfilling)
    elif event_type == "charge.updated":
        logger.info("Charge updated: %s status=%s", ref, _str(payload.get("status")) or "unknown")
    elif event_type == "payment_intent.created":
        logger.info("Payment intent created: %s", ref)
    elif event_type == "customer.created":
        logger.info("Customer created: %s", ref)
    elif event_type == "transfer.succeeded":
        logger.info("Transfer succeeded: %s", ref)
    elif event_type == "transfer.failed":
        logger.info("Transfer failed: %s", ref)
    else:
        # Acknowledge events this handler doesn't process so Modem Pay doesn't retry them
        logger.info("Unhandled Modem Pay event: %s", event_type)

    # Answer 200 quickly: anything else makes Modem Pay retry (up to 3 times, 10 minutes apart)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
