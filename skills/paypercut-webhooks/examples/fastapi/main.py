# Generated with: paypercut-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Paypercut webhook receiver for FastAPI.

Paypercut-Signature: t=<unix seconds>,v1=<hex>
v1 = hex HMAC-SHA256(endpoint secret, f"{t}.{raw body}")
"""

import hashlib
import hmac
import json
import os
import re
import time
from typing import Dict, List, Optional, Tuple

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI(title="Paypercut Webhook Handler")

# Paypercut's docs don't name the HTTP method, so accept all the usual ones.
ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

HEX64 = re.compile(rb"[0-9a-fA-F]{64}")

# In-memory dedupe for the demo. Use Redis or your database in production.
processed_delivery_ids: set = set()


def parse_signature_header(header: Optional[str]) -> Optional[Tuple[str, List[str]]]:
    """Return (t exactly as sent, every v1 entry); other keys (v0...) are ignored."""
    if not header:
        return None
    t = None
    v1: List[str] = []
    for part in header.split(","):
        key, sep, value = part.partition("=")
        if not sep:
            continue
        key, value = key.strip(), value.strip()
        if key == "t" and t is None:
            t = value
        elif key == "v1":
            v1.append(value)
    if not t or not v1:
        return None
    return t, v1


def tolerance_from_env() -> int:
    """PAYPERCUT_WEBHOOK_TOLERANCE_SECONDS: unset, empty, invalid or 0 = no window."""
    try:
        return max(0, int(os.environ.get("PAYPERCUT_WEBHOOK_TOLERANCE_SECONDS", "").strip() or 0))
    except ValueError:
        return 0


def verify_paypercut_signature(
    raw_body: bytes,
    header: Optional[str],
    secret: Optional[str] = None,
    tolerance_seconds: Optional[int] = None,
) -> bool:
    """HMAC-SHA256 (hex) over b"{t}." + raw body, keyed with the secret's UTF-8 bytes.

    `t` is used exactly as it appears in the header, and the body stays raw bytes.
    """
    secret = secret if secret is not None else os.environ.get("PAYPERCUT_WEBHOOK_SECRET")
    if not secret:
        return False
    parsed = parse_signature_header(header)
    if parsed is None:
        return False
    t, candidates = parsed

    tolerance = tolerance_from_env() if tolerance_seconds is None else tolerance_seconds
    if tolerance > 0:
        if not re.fullmatch(r"[0-9]+", t):
            return False
        if abs(int(time.time()) - int(t)) > tolerance:
            return False

    expected = hmac.new(
        secret.encode("utf-8"), t.encode("utf-8") + b"." + raw_body, hashlib.sha256
    ).hexdigest().encode("ascii")

    # Accept if ANY v1 entry matches (key rotation). Validate the format first (exactly 64 hex
    # characters, compared case-insensitively), then compare bytes in constant time.
    ok = False
    for candidate in candidates:
        raw = candidate.encode("utf-8")
        if not HEX64.fullmatch(raw):
            continue
        if hmac.compare_digest(raw.lower(), expected):
            ok = True
    return ok


async def require_paypercut_signature(request: Request) -> bytes:
    """FastAPI dependency: returns the raw body once the signature checks out."""
    # Fail closed: never accept unverified deliveries because a secret is missing.
    if not os.environ.get("PAYPERCUT_WEBHOOK_SECRET"):
        print("Set PAYPERCUT_WEBHOOK_SECRET")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes, exactly as received (empty for a GET). Never verify a parsed body.
    raw_body = await request.body()
    if not verify_paypercut_signature(raw_body, request.headers.get("paypercut-signature")):
        raise HTTPException(status_code=401, detail="Invalid or missing Paypercut-Signature")
    return raw_body


def handle_paypercut_event(event: Dict) -> None:
    # Envelope: {type, data, account?} (`account` identifies a connected account)
    event_type = event.get("type")
    data = event.get("data")
    obj_id = data.get("id") if isinstance(data, dict) else None
    scope = f" (connected account {event['account']})" if event.get("account") else ""

    if event_type == "checkout_session.completed":
        print(f"Checkout session completed: {obj_id}{scope}")
        # TODO: fulfil the order
    elif event_type == "payment.succeeded":
        print(f"Payment succeeded: {obj_id}{scope}")
        # TODO: mark the payment as paid
    elif event_type == "payment.failed":
        print(f"Payment failed: {obj_id}{scope}")
        # TODO: notify the customer / retry
    elif event_type == "payment_intent.authorized":
        print(f"Payment intent authorized: {obj_id}{scope}")
        # TODO: capture when ready
    elif event_type == "payment_intent.captured":
        print(f"Payment intent captured: {obj_id}{scope}")
        # TODO: record the captured funds
    elif event_type == "payout.paid":
        print(f"Payout paid: {obj_id}{scope}")
        # TODO: reconcile the payout
    elif event_type == "payout.failed":
        print(f"Payout failed: {obj_id}{scope}")
        # TODO: alert finance
    elif event_type == "account.updated":
        print(f"Account updated: {obj_id}{scope}")
        # TODO: refresh the connected account's status
    elif event_type == "invoice.paid":
        print(f"Invoice paid: {obj_id}{scope}")
        # TODO: extend the subscription
    elif event_type == "invoice.payment_failed":
        print(f"Invoice payment failed: {obj_id}{scope}")
        # TODO: start dunning
    elif event_type == "identity.verification_session.verified":
        print(f"Identity verification verified: {obj_id}{scope}")
        # TODO: unlock the verified user
    else:
        print(f"Unhandled Paypercut event: {event_type}")


@app.api_route("/webhooks/paypercut", methods=ALLOWED_METHODS)
async def handle_paypercut_webhook(
    request: Request, raw_body: bytes = Depends(require_paypercut_signature)
):
    # The signature was checked first, for every method.
    # A verified request with no body (for example GET) is acknowledged.
    if not raw_body:
        return {"received": True}

    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    if not isinstance(event, dict) or not isinstance(event.get("type"), str):
        raise HTTPException(status_code=400, detail="Invalid event type format")

    # Dedupe on Paypercut-Delivery-Id, recorded only after the event is handled.
    delivery_id = request.headers.get("paypercut-delivery-id")
    if delivery_id and delivery_id in processed_delivery_ids:
        return {"received": True, "duplicate": True}

    try:
        handle_paypercut_event(event)
    except Exception as exc:  # noqa: BLE001
        print(f"Error handling Paypercut event: {exc}")
        raise HTTPException(status_code=500, detail="Handler error")  # Paypercut retries on 500

    if delivery_id:
        processed_delivery_ids.add(delivery_id)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
