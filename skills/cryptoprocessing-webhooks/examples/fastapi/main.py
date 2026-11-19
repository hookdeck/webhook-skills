# Generated with: cryptoprocessing-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

SIGNATURE_PATTERN = re.compile(r"[0-9a-fA-F]{128}")

# Callbacks fire on every status change and failed deliveries are retried, so
# remember what was already handled. Use a database or cache in production.
seen: set = set()


def callback_key(event: dict) -> str:
    """Key for spotting a repeated callback.

    Invoices send `pending` again for each partial payment and payment requests send
    `processing` again for each detected transaction, so the key includes the `txid`s in
    `transactions`: a new txid means a new payment.
    """
    event_id = event.get("id", event.get("payment_request_id"))
    transactions = event.get("transactions") if isinstance(event.get("transactions"), list) else []
    txids = ",".join(sorted(str(tx["txid"]) for tx in transactions if isinstance(tx, dict) and tx.get("txid")))
    return f"{event.get('type')}:{event_id}:{event.get('status')}:{txids}"


def verify_cryptoprocessing_signature(
    raw_body: bytes,
    signature: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify a CryptoProcessing callback signature.

    X-Processing-Signature = lowercase hex HMAC-SHA512 of the raw body, keyed with
    the secret of the active Master API key (used as UTF-8 bytes). Nothing else is signed.
    """
    if not signature or not secret:
        return False
    # Validate length and alphabet before comparing
    if not SIGNATURE_PATTERN.fullmatch(signature):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(signature.lower().encode(), expected.encode())


def handle_callback(event: dict) -> None:
    """Dispatch a verified callback on the body's `type` field.

    `status` carries the new state (confirmed, not_confirmed, cancelled, pending, paid, ...).
    """
    kind = event.get("type")
    status = event.get("status")

    if kind == "deposit":
        received = event.get("currency_received") or {}
        print(f"Deposit {event.get('id')} {status}: {received.get('amount')} {received.get('currency')}")
        # Your code: credit the user once status is "confirmed"
    elif kind == "withdrawal":
        print(f"Withdrawal {event.get('id')} {status} (foreign_id {event.get('foreign_id')})")
        # Your code: mark the payout as settled or failed
    elif kind == "exchange":
        sent = event.get("currency_sent") or {}
        received = event.get("currency_received") or {}
        print(f"Exchange {event.get('id')} {status}: {sent.get('currency')} -> {received.get('currency')}")
        # Your code: update the conversion record
    elif kind == "payment_request":
        print(f"Payment request {event.get('payment_request_id')} {status} (foreign_id {event.get('foreign_id')})")
        # Your code: fulfil the order once the request is paid
    else:
        # deposit_exchange, deposit_wallet_client, withdrawal_exchange,
        # withdrawal_instant, withdrawal_instant_exchange, invoice, and future types
        print(f"Unhandled CryptoProcessing callback type: {kind} ({status})")


@app.post("/webhooks/cryptoprocessing")
async def cryptoprocessing_webhook(
    request: Request,
    x_processing_signature: Optional[str] = Header(None),
):
    secret = os.getenv("CRYPTOPROCESSING_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes, whatever the content type - never re-serialize before verifying
    raw_body = await request.body()

    if not verify_cryptoprocessing_signature(raw_body, x_processing_signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # A duplicate of an already handled callback: answer 201 to stop its retries
    key = callback_key(event)
    if key in seen:
        return JSONResponse({"received": True, "duplicate": True}, status_code=201)

    handle_callback(event)
    seen.add(key)

    # Only HTTP 200 stops delivery
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
