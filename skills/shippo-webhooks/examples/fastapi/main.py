# Generated with: shippo-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging
import os
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()

logger = logging.getLogger(__name__)

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set SHIPPO_TIMESTAMP_TOLERANCE_SECONDS to a positive value to opt in.
# A value that isn't a whole number of seconds is treated as 0 (check off), with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("SHIPPO_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logger.warning(
                "SHIPPO_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; "
                "the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def verify_shippo_signature(raw_body: bytes, header: str, secret: str) -> Optional[str]:
    """
    Verify the Shippo-Auth-Signature header.

    Format: "t=<unix timestamp>,v1=<hex HMAC-SHA256>"
    Signed content: "<t>.<raw body>", keyed with the HMAC secret Shippo provisioned.
    Returns None when valid, otherwise an error message.
    """
    timestamp = None
    signatures = []
    for part in header.split(","):
        key, _, value = part.strip().partition("=")
        if key == "t":
            timestamp = value.strip()
        elif key == "v1":
            signatures.append(value.strip())

    if not timestamp or not timestamp.isdigit() or not signatures:
        return "Malformed Shippo-Auth-Signature header"

    # Optional replay protection (off unless SHIPPO_TIMESTAMP_TOLERANCE_SECONDS > 0)
    tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs(int(time.time()) - int(timestamp)) > tolerance:
        return "Timestamp outside tolerance"

    signed_payload = f"{timestamp}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()

    # Timing-safe comparison against each provided v1 signature
    if any(hmac.compare_digest(expected.encode(), sig.encode()) for sig in signatures):
        return None
    return "Invalid signature"


def verify_url_token(received: Optional[str], expected: str) -> bool:
    """Verify the self-generated token appended to the webhook URL (?token=...)."""
    if not received:
        return False
    return hmac.compare_digest(received.encode(), expected.encode())


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/shippo")
async def shippo_webhook(
    request: Request,
    shippo_auth_signature: Optional[str] = Header(None, alias="Shippo-Auth-Signature"),
):
    secret = os.getenv("SHIPPO_WEBHOOK_SECRET")
    token = os.getenv("SHIPPO_WEBHOOK_TOKEN")

    if not secret and not token:
        print("Set SHIPPO_WEBHOOK_SECRET (HMAC) and/or SHIPPO_WEBHOOK_TOKEN (URL token)")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # URL token check (fallback when HMAC isn't enabled; can be combined with HMAC)
    if token and not verify_url_token(request.query_params.get("token"), token):
        raise HTTPException(status_code=400, detail="Invalid token")

    # Read the RAW body; don't parse JSON before verifying
    raw_body = await request.body()

    # HMAC check (only sent once Shippo has provisioned a secret for your account)
    if secret:
        if not shippo_auth_signature:
            raise HTTPException(status_code=400, detail="Missing Shippo-Auth-Signature header")
        error = verify_shippo_signature(raw_body, shippo_auth_signature, secret)
        if error:
            print(f"Shippo signature verification failed: {error}")
            raise HTTPException(status_code=400, detail=error)

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event = payload.get("event") if isinstance(payload, dict) else None
    data = payload.get("data") if isinstance(payload, dict) else None
    data_obj = data if isinstance(data, dict) else {}
    test_suffix = " (test)" if isinstance(payload, dict) and payload.get("test") else ""
    print(f"Received Shippo webhook: {event}{test_suffix}")

    # Respond within 3 seconds; move slow work to a queue.
    # Shippo sends no event ID, so dedupe on natural keys.
    if event == "track_updated":
        status = (data_obj.get("tracking_status") or {}).get("status")
        print(f"Tracking updated: {data_obj.get('tracking_number')} {status}")
        # TODO: update order status, notify customer on DELIVERED / FAILURE
    elif event == "transaction_created":
        print(f"Transaction created: {data_obj.get('object_id')} {data_obj.get('tracking_number')}")
        # TODO: store label_url and tracking number
    elif event == "transaction_updated":
        print(f"Transaction updated: {data_obj.get('object_id')} {data_obj.get('status')}")
        # TODO: sync label/transaction state
    elif event == "batch_created":
        print(f"Batch created: {data}")
        # TODO: review and purchase the batch
    elif event == "batch_purchased":
        print(f"Batch purchased: {data}")
        # TODO: download merged label PDFs
    elif event == "automations_label_resolved":
        print(f"Automations label resolved: {data_obj.get('request_id')} {data_obj.get('status')}")
        # TODO: dedupe on request_id; fulfil or alert on failure
    else:
        print(f"Unhandled Shippo event: {event}")

    return {"received": True, "event": event}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
