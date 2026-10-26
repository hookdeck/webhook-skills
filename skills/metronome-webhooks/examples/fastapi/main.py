# Generated with: metronome-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import re
import time
from email.utils import parsedate_to_datetime

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Metronome Webhook Handler")

# Metronome may deliver an event more than once: dedupe on the body's `id`.
# In-memory for the example; use a shared store (Redis, a DB unique key) in production.
seen_event_ids: set = set()

_HEX64 = re.compile(rb"[0-9a-fA-F]{64}")


def tolerance_seconds() -> float:
    # Retries and Hookdeck replays resend the original X-Metronome-Date, and Hookdeck
    # applies no tolerance itself, so the window is OFF unless you opt in.
    try:
        return max(float(os.getenv("METRONOME_WEBHOOK_TOLERANCE_SECONDS", "0")), 0.0)
    except ValueError:
        return 0.0


def build_signed_bytes(raw_body: bytes, date_header: str) -> bytes:
    """The exact bytes Metronome signs: X-Metronome-Date + LF (0x0A) + raw body.

    The header is encoded latin-1 (as received, never trimmed or reformatted); the body
    is never decoded and re-encoded."""
    return b"".join([date_header.encode("latin-1"), b"\n", raw_body])


def compute_metronome_signature(raw_body: bytes, date_header: str, secret: str) -> str:
    # The secret is used as-is (UTF-8 bytes), not hex- or base64-decoded
    return hmac.new(
        secret.encode("utf-8"), build_signed_bytes(raw_body, date_header), hashlib.sha256
    ).hexdigest()


def verify_metronome_signature(raw_body: bytes, signature_header, date_header, secret) -> bool:
    """Verify Metronome-Webhook-Signature: bare hex HMAC-SHA256, no prefix."""
    if not signature_header or not date_header or not secret:
        return False
    try:
        provided = signature_header.encode("latin-1")
        expected = compute_metronome_signature(raw_body, date_header, secret).encode("ascii")
    except UnicodeEncodeError:
        return False
    # Validate the format first: exactly 64 hex chars (compared case-insensitively)
    if not _HEX64.fullmatch(provided):
        return False
    return hmac.compare_digest(provided.lower(), expected)


def is_date_within_tolerance(date_header: str, tolerance: float = None, now: float = None) -> bool:
    # X-Metronome-Date is an HTTP date, e.g. 'Mon, 02 Jan 2006 22:04:05 GMT'
    tolerance = tolerance_seconds() if tolerance is None else tolerance
    if not tolerance:
        return True
    try:
        sent = parsedate_to_datetime(date_header).timestamp()
    except (TypeError, ValueError):
        return False
    now = time.time() if now is None else now
    return abs(now - sent) <= tolerance


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/metronome")
async def metronome_webhook(request: Request):
    # Raw bytes: verify these exactly, parse only afterwards
    raw_body = await request.body()
    signature = request.headers.get("metronome-webhook-signature")
    # Use X-Metronome-Date, never Date (intermediaries may rewrite Date)
    date_header = request.headers.get("x-metronome-date")

    if not verify_metronome_signature(
        raw_body, signature, date_header, os.getenv("METRONOME_WEBHOOK_SECRET")
    ):
        logger.error("Metronome webhook signature verification failed")
        return JSONResponse(status_code=401, content={"error": "Invalid signature"})

    if not is_date_within_tolerance(date_header):
        return JSONResponse(status_code=401, content={"error": "X-Metronome-Date outside tolerance"})

    try:
        event = json.loads(raw_body)
    except ValueError:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    event_id = event.get("id") if isinstance(event, dict) else None
    if event_id:
        if event_id in seen_event_ids:
            return {"received": True, "duplicate": True}
        seen_event_ids.add(event_id)

    # Threshold, invoice and integration events nest data under `properties`;
    # contract, commit, credit and subscription events are flat.
    data = (event.get("properties") or event) if isinstance(event, dict) else {}
    event_type = event.get("type") if isinstance(event, dict) else None

    if event_type == "alerts.spend_threshold_reached":
        logger.info("Spend threshold reached: %s %s", data.get("customer_id"), data.get("current_spend"))
        # TODO: Notify the customer or throttle
    elif event_type == "alerts.low_remaining_credit_balance_reached":
        logger.info("Low credit balance: %s %s", data.get("customer_id"), data.get("remaining_balance"))
        # TODO: Trigger a top-up
    elif event_type == "alerts.low_remaining_commit_balance_reached":
        logger.info("Low commit balance: %s", data.get("customer_id"))
        # TODO: Alert the account owner
    elif event_type == "alerts.usage_threshold_reached":
        logger.info("Usage threshold reached: %s", data.get("customer_id"))
        # TODO: Notify the customer
    elif event_type == "alerts.invoice_total_reached":
        logger.info("Invoice total reached: %s", data.get("customer_id"))
        # TODO: Flag the invoice for review
    elif event_type == "contract.create":
        logger.info("Contract created: %s", data.get("contract_id"))
        # TODO: Provision the customer
    elif event_type == "contract.start":
        logger.info("Contract started: %s", data.get("contract_id"))
    elif event_type == "contract.edit":
        logger.info("Contract edited: %s", data.get("contract_id"))
    elif event_type == "contract.end":
        logger.info("Contract ended: %s", data.get("contract_id"))
        # TODO: Revoke entitlements
    elif event_type == "contract.archive":
        logger.info("Contract archived: %s", data.get("contract_id"))
    elif event_type == "commit.create":
        logger.info("Commit created: %s", data.get("commit_id"))
    elif event_type == "credit.create":
        logger.info("Credit created: %s", data.get("credit_id"))
    elif event_type == "invoice.finalized":
        logger.info("Invoice finalized: %s", data.get("invoice_id"))
        # TODO: Record the receivable
    elif event_type == "invoice.void":
        logger.info("Invoice voided: %s", data.get("invoice_id"))
    elif event_type == "invoice.billing_provider_error":
        logger.info("Billing provider error: %s %s", data.get("invoice_id"), data.get("billing_provider_error"))
        # TODO: Page whoever owns the billing integration
    elif event_type == "subscription.start":
        logger.info("Subscription started: %s", data.get("subscription_id"))
    elif event_type == "subscription.end":
        logger.info("Subscription ended: %s", data.get("subscription_id"))
    else:
        logger.info("Unhandled event type: %s", event_type)

    return {"received": True}
