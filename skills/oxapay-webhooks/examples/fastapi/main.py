import hmac
import hashlib
import json
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse

load_dotenv()

app = FastAPI()

# SHA-512 digest as hex: exactly 128 hex characters
HEX_128 = re.compile(r"^[0-9a-fA-F]{128}$")


def verify_oxapay_signature(
    raw_body: bytes,
    signature: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify an OxaPay webhook signature.

    OxaPay sends `HMAC: <hex>` = lowercase hex HMAC-SHA512 of the raw request
    body, keyed with your merchant API key (payment callbacks) or payout API
    key (payout callbacks). The key is used as-is, as UTF-8 bytes.
    """
    if not signature or not secret:
        return False
    # Validate the format first: exactly 128 hex characters (SHA-512)
    if not HEX_128.fullmatch(signature):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).digest()
    received = bytes.fromhex(signature)  # safe: format validated above
    return hmac.compare_digest(received, expected)


def handle_oxapay_callback(event: dict) -> None:
    """Dispatch a verified OxaPay callback on `status`.

    There is no event name: each callback is the transaction's current state.
    `type` is the flow: invoice, white_label, static_address, payment_link,
    donation (payments) or payout.
    """
    status = event.get("status")
    track_id = event.get("track_id")

    if status == "Paying":
        print(f"Payment {track_id} ({event.get('type')}) paying: awaiting network confirmation")
        # TODO: Mark the order as payment in progress; do NOT deliver goods yet
    elif status == "Paid":
        print(f"Payment {track_id} ({event.get('type')}) paid: {event.get('amount')} {event.get('currency')}")
        # TODO: Fulfil the order (look it up by event["order_id"])
    elif status == "Confirming":
        print(f"Payout {track_id} confirming, tx {event.get('tx_hash')}")
        # TODO: Mark the payout as sent and awaiting confirmation
    elif status == "Confirmed":
        print(f"Payout {track_id} confirmed, tx {event.get('tx_hash')}")
        # TODO: Mark the payout as completed
    elif status == "Failed":
        print(f"Payout {track_id} failed")
        # TODO: Alert and release or retry the payout
    else:
        print(f"Unhandled OxaPay status: {status}")


@app.post("/webhooks/oxapay")
async def oxapay_webhook(request: Request):
    secret = os.getenv("OXAPAY_WEBHOOK_SECRET")
    if not secret:
        print("OXAPAY_WEBHOOK_SECRET is not configured")
        return PlainTextResponse("Webhook secret not configured", status_code=500)

    # Raw bytes, exactly as received, whatever the content type
    raw_body = await request.body()

    if not verify_oxapay_signature(raw_body, request.headers.get("hmac"), secret):
        print("OxaPay webhook signature verification failed")
        return PlainTextResponse("Invalid signature", status_code=401)

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except ValueError:
        return PlainTextResponse("Invalid JSON", status_code=400)
    if not isinstance(event, dict):
        return PlainTextResponse("Invalid JSON", status_code=400)

    # Retries resend the same callback: de-duplicate on track_id + status.
    handle_oxapay_callback(event)

    # OxaPay counts a delivery as successful only with HTTP 200 and body "ok"
    return PlainTextResponse("ok", status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}
