# Generated with: payt-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

# x-payt-signature is the bare hex HMAC-SHA256 digest: exactly 64 hex characters, no prefix.
SIGNATURE_FORMAT = re.compile(r"[0-9a-fA-F]{64}")


def verify_payt_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """Verify the x-payt-signature header.

    Signature = hex(HMAC-SHA256(secret, raw_body)): the raw body bytes only (no timestamp or id
    is signed), key = the secret's UTF-8 bytes. The format is checked first; hex is
    case-insensitive, so the header is lowercased before the constant-time compare (on bytes).
    """
    if not secret or not signature or not SIGNATURE_FORMAT.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))


def handle_event(event_name: str, context: dict[str, Any]) -> None:
    """The body is {"event": {"event_name", "context", "event_time"}}: dispatch on event_name."""
    debtor = context.get("debtor")
    if not isinstance(debtor, dict):
        debtor = {}

    if event_name == "invoice_created":
        print(f"Invoice {context.get('invoice_number')} created for {debtor.get('name')} "
              f"(open: {context.get('amount_open')} {context.get('currency_code')})")
        # TODO: sync the new invoice to your system
    elif event_name in ("invoice_paid", "invoice_closed"):
        print(f"Invoice {context.get('invoice_number')} {'paid' if event_name == 'invoice_paid' else 'closed'}")
        # TODO: mark the invoice as settled
    elif event_name == "invoice_payment_created":
        # book_amount is the amount in the administration's bookkeeping currency
        invoice = context.get("invoice")
        if not isinstance(invoice, dict):
            invoice = {}
        print(f"Payment {context.get('id')} of {context.get('amount')} {context.get('currency_code')} "
              f"on invoice {invoice.get('invoice_number')}")
        # TODO: book the payment in your accounting system
    elif event_name == "case_created":
        print(f"Debt collection case {context.get('credit_case_number')} created "
              f"with {len(context.get('invoices') or [])} invoice(s)")
        # TODO: flag the debtor's invoices as in collection
    elif event_name == "case_paid":
        print(f"Debt collection case {context.get('credit_case_number')} fully paid")
    elif event_name == "bundled_reminder_sent":
        print(f"Bundled reminder {context.get('id')} sent as {context.get('sent_as_format')} "
              f"({len(context.get('invoices') or [])} invoice(s))")
    elif event_name == "payment_plan_created":
        print(f"Payment plan {context.get('id')} created for {debtor.get('name')}")
    elif event_name == "credit_limit_exceeded":
        print(f"Credit limit exceeded for debtor {context.get('debtor_code')} "
              f"({context.get('book_open_amount')} open of {context.get('credit_limit_amount')})")
        # TODO: alert your credit controller
    elif event_name == "psp_transaction_successful":
        print(f"PSP transaction registered on invoice {context.get('invoice_number')}")
    else:
        print(f"Unhandled Payt event: {event_name}")


@app.post("/webhooks/payt")
async def payt_webhook(request: Request):
    secret = os.getenv("PAYT_WEBHOOK_SECRET")
    if not secret:
        print("PAYT_WEBHOOK_SECRET is not set")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the exact bytes; parse JSON only after the signature check
    raw_body = await request.body()
    if not verify_payt_signature(raw_body, request.headers.get("x-payt-signature"), secret):
        return JSONResponse({"error": "Invalid or missing signature"}, status_code=401)

    try:
        body = json.loads(raw_body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400)
    event = body.get("event") if isinstance(body, dict) else None
    if not isinstance(event, dict) or not isinstance(event.get("event_name"), str):
        return JSONResponse({"error": "Missing event.event_name"}, status_code=400)

    # Delivery is at least once and unordered: make processing idempotent. For an unknown
    # object Payt suggests answering 404 so it retries later.
    context = event.get("context")
    try:
        handle_event(event["event_name"], context if isinstance(context, dict) else {})
    except Exception as exc:  # noqa: BLE001
        print(f"Error handling Payt webhook: {exc}")
        return JSONResponse({"error": "Handler error"}, status_code=500)

    # Payt needs a 200 within 10 seconds, otherwise the delivery is retried
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
