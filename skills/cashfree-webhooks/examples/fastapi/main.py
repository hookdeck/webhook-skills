# Generated with: cashfree-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

# ---------------------------------------------------------------------------
# Cashfree signs Payment Gateway, Payouts V2, Secure ID and PPI webhooks:
#   x-webhook-signature  standard base64 (padded) HMAC-SHA256, no prefix
#   x-webhook-timestamp  timestamp that is part of the signed content
# Signed content: x-webhook-timestamp value, then the raw body, NO separator.
# Key: the client secret as UTF-8 (Partner API key for partner webhooks).
# Legacy Payouts V1 / Cashgram webhooks are form-encoded and use another scheme.
# ---------------------------------------------------------------------------

# 44 characters: 43 base64 characters plus one "=" (a 32-byte digest).
SIGNATURE_PATTERN = re.compile(r"[A-Za-z0-9+/]{43}=")


def verify_cashfree_signature(
    raw_body: bytes,
    signature: Optional[str],
    timestamp: Optional[str],
    secret: str,
    tolerance_seconds: float = 0,
) -> Optional[str]:
    """Return None when the delivery is valid, otherwise an error message.

    Works on bytes: the raw body is never decoded and re-encoded, and the
    timestamp header is used exactly as received (latin-1).
    """
    if not signature or not timestamp:
        return "Missing x-webhook-signature or x-webhook-timestamp"
    # Validate the format first; the whole header is one digest.
    if not SIGNATURE_PATTERN.fullmatch(signature):
        return "Malformed x-webhook-signature"

    signed_content = b"".join([timestamp.encode("latin-1"), raw_body])
    digest = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    # Bytes, never str, for compare_digest; case-sensitive exact comparison.
    if not hmac.compare_digest(expected, signature.encode("ascii")):
        return "Signature mismatch"

    # Opt-in only. Cashfree does not state the timestamp unit, so accept seconds or
    # milliseconds. Retries resend the original timestamp, so this rejects them once old.
    if tolerance_seconds > 0:
        try:
            numeric = float(timestamp)
        except ValueError:
            return "Timestamp is not numeric"
        seconds = numeric / 1000 if numeric > 1e11 else numeric
        if abs(time.time() - seconds) > tolerance_seconds:
            return "Timestamp outside tolerance"
    return None


def handle_event(payload: dict) -> None:
    # Payment Gateway and Payouts V2 put the event in `type`; Secure ID and PPI use `event_type`.
    name = payload.get("type") or payload.get("event_type")
    data = _as_dict(payload.get("data"))

    # --- Payment Gateway (the overview samples abbreviate some names) -------
    if name in ("PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_SUCCESS"):
        print(f"Payment succeeded: order {_as_dict(data.get('order')).get('order_id')}, "
              f"payment {_as_dict(data.get('payment')).get('cf_payment_id')}")
    elif name in ("PAYMENT_FAILED_WEBHOOK", "PAYMENT_FAILED"):
        print(f"Payment failed: order {_as_dict(data.get('order')).get('order_id')}")
    elif name in ("PAYMENT_USER_DROPPED_WEBHOOK", "PAYMENT_USER_DROPPED"):
        print(f"Customer dropped payment: order {_as_dict(data.get('order')).get('order_id')}")
    elif name == "REFUND_STATUS_WEBHOOK":
        print(f"Refund status update: {_as_dict(data.get('refund')).get('refund_id')}")
    elif name == "SETTLEMENT_STATUS_WEBHOOK":
        print("Settlement status update")
    # --- Payouts V2 --------------------------------------------------------
    elif name in ("TRANSFER_SUCCESS", "TRANSFER_FAILED", "TRANSFER_REVERSED"):
        print(f"{name}: transfer {data.get('transfer_id')} ({data.get('status')})")
    # --- Secure ID (event_type) --------------------------------------------
    elif name == "BANK_ACCOUNT_VERIFICATION_SUCCESS":
        print(f"Bank account verified: {data.get('reference_id')} ({data.get('account_status')})")
    elif name == "VKYC_AUDITOR_REVIEW_COMPLETED":
        print(f"Video KYC review done: {data.get('verification_id')} ({data.get('sub_status')})")
    # --- PPI (event_type) --------------------------------------------------
    elif name == "PPI_CREDIT_SUCCESS":
        print(f"Wallet credit: {data.get('credit_id')} to {data.get('wallet_id')}")
    else:
        print(f"Unhandled Cashfree event: {name}")


# Cashfree treats anything other than HTTP 200 as a failure (3xx included).
@app.post("/webhooks/cashfree")
async def cashfree_webhook(request: Request):
    secret = os.environ.get("CASHFREE_WEBHOOK_SECRET")
    if not secret:
        print("CASHFREE_WEBHOOK_SECRET is not set; rejecting delivery")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Raw bytes: the signature covers the exact body, so never parse before verifying.
    raw_body = await request.body()
    try:
        tolerance = float(os.environ.get("CASHFREE_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0
    error = verify_cashfree_signature(
        raw_body,
        request.headers.get("x-webhook-signature"),
        request.headers.get("x-webhook-timestamp"),
        secret,
        tolerance,
    )
    if error:
        print(f"Cashfree webhook verification failed: {error}")
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        payload = json.loads(raw_body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(payload, dict):
        return JSONResponse({"error": "Invalid payload"}, status_code=400)

    try:
        # At-least-once, unordered delivery: dedupe on business IDs such as
        # cf_payment_id or transfer_id, and enqueue slow work instead of doing it here.
        handle_event(payload)
    except Exception as exc:  # noqa: BLE001
        print(f"Error handling Cashfree event: {exc}")
        return JSONResponse({"error": "Internal server error"}, status_code=500)

    return JSONResponse({"received": True}, status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}
