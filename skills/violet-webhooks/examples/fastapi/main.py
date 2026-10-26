# Generated with: violet-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os
import re
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()

# X-Violet-Hmac is the standard (padded) base64 of a 32-byte digest: 43 characters plus "="
SIGNATURE_FORMAT = re.compile(r"[A-Za-z0-9+/]{43}=", re.ASCII)

ORDER_TOPICS = {
    "ORDER_ACCEPTED",
    "ORDER_UPDATED",
    "ORDER_COMPLETED",
    "ORDER_SHIPPED",
    "ORDER_DELIVERED",
    "ORDER_REFUNDED",
    "ORDER_CANCELLED",
    "ORDER_FAILED",
}
MERCHANT_TOPICS = {
    "MERCHANT_CONNECTED",
    "MERCHANT_DISCONNECTED",
    "MERCHANT_ENABLED",
    "MERCHANT_DISABLED",
    "MERCHANT_NEEDS_ATTENTION",
    "MERCHANT_COMPLETE",
}
TRANSFER_TOPICS = {
    "TRANSFER_SENT",
    "TRANSFER_PARTIALLY_SENT",
    "TRANSFER_FAILED",
    "TRANSFER_UPDATED",
    "TRANSFER_REVERSED",
    "TRANSFER_PARTIALLY_REVERSED",
    "TRANSFER_REVERSAL_FAILED",
}


def verify_violet_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    """Verify a Violet webhook signature.

    Violet sends ``X-Violet-Hmac: <base64>``, the base64 HMAC-SHA256 of the raw request body
    bytes, keyed with the app secret used as UTF-8 (not hex- or base64-decoded). Nothing else
    is signed.
    """
    # Validate the format first (exact length and alphabet); fullmatch rejects a trailing newline
    if not signature_header or not SIGNATURE_FORMAT.fullmatch(signature_header):
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    # Compare the base64 strings exactly (as Hookdeck does), as bytes: a value whose last
    # character carries stray low bits decodes to the same digest but is not what Violet sends
    return hmac.compare_digest(signature_header.encode("ascii"), expected)


async def verified_body(
    request: Request,
    x_violet_hmac: str | None = Header(default=None),
) -> bytes:
    """Dependency: read the raw bytes and reject the request unless the signature is valid."""
    secret = os.environ.get("VIOLET_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    # Read the exact bytes BEFORE parsing: the signature covers the raw body only
    raw_body = await request.body()
    if not verify_violet_signature(raw_body, x_violet_hmac, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


def summarize(body: dict[str, Any]) -> tuple[Any, str | None]:
    """Every field of the body is untrusted: read through type checks, never assume a shape."""
    raw_id = body.get("id")
    entity_id = raw_id if isinstance(raw_id, (str, int)) and not isinstance(raw_id, bool) else "unknown"
    status = body.get("status")
    return entity_id, status if isinstance(status, str) else None


def handle_event(topic: str, body: dict[str, Any]) -> None:
    """Violet sends the entity itself as the body and names the event only in X-Violet-Topic."""
    entity_id, status = summarize(body)
    suffix = f" ({status})" if status else ""
    if topic in ORDER_TOPICS:
        print(f"{topic}: order {entity_id}{suffix}")
    elif topic in MERCHANT_TOPICS:
        name = body.get("name")
        print(f'{topic}: merchant {entity_id} "{name if isinstance(name, str) else "unknown"}"{suffix}')
    elif topic in TRANSFER_TOPICS:
        amount = body.get("amount")
        currency = body.get("currency")
        amount_text = amount if isinstance(amount, (int, float)) and not isinstance(amount, bool) else "unknown"
        currency_text = currency if isinstance(currency, str) else ""
        print(f"{topic}: transfer {entity_id} {amount_text} {currency_text}".strip() + suffix)
    else:
        # 52 documented events: handle the ones you need and log the rest
        print(f"Unhandled Violet topic: {topic}")


@app.post("/webhooks/violet")
async def violet_webhook(
    raw_body: bytes = Depends(verified_body),
    x_violet_topic: str | None = Header(default=None),
    x_violet_event_id: str | None = Header(default=None),
):
    # Only the header names the event: without it the body cannot be classified
    if not x_violet_topic:
        raise HTTPException(status_code=400, detail="Missing X-Violet-Topic header")

    try:
        body = json.loads(raw_body)
    except (ValueError, RecursionError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object")

    # X-Violet-Event-Id identifies the event: use it for idempotency (retries and resends repeat it)
    print(f"Violet event {x_violet_event_id or '(no id)'}")
    handle_event(x_violet_topic, body)

    # Respond 2XX within 10 seconds; do slow work asynchronously
    return {"received": True}
