# Generated with: moonpay-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import logging
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set MOONPAY_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("MOONPAY_TIMESTAMP_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "MOONPAY_TIMESTAMP_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup


def verify_moonpay_webhook(
    raw_body: bytes,
    header: str | None,
    api_key: str,
    tolerance: int | None = None,
    now: float | None = None,
) -> bool:
    """Verify a MoonPay webhook signature (POST webhooks only).

    Header: ``Moonpay-Signature-V2: t=<unix seconds>,s=<lowercase hex>``
    s = hex HMAC-SHA256 over ``<t>.<raw body>``, keyed with the webhook API key as a string.
    GET callbacks sign the query string instead and are NOT covered here.
    """
    if not header or not api_key:
        return False
    pairs = [p.strip().split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v for k, v in pairs if k == "t"), None)
    signature = next((v for k, v in pairs if k == "s"), None)
    if not t or not (t.isascii() and t.isdigit()) or not signature:
        return False

    # Opt-in replay window: retries and replays carry the original `t`.
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0 and abs((time.time() if now is None else now) - int(t)) > tolerance:
        return False

    expected = hmac.new(
        api_key.encode("utf-8"), t.encode("utf-8") + b"." + raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature.encode(), expected.encode())


@app.post("/webhooks/moonpay")
async def moonpay_webhook(request: Request):
    # Read the raw body BEFORE parsing - the signature is over the exact bytes.
    raw_body = await request.body()
    header = request.headers.get("moonpay-signature-v2")
    api_key = os.environ.get("MOONPAY_WEBHOOK_API_KEY")

    if not header:
        raise HTTPException(status_code=400, detail="Missing Moonpay-Signature-V2 header")
    if not api_key:
        raise HTTPException(status_code=500, detail="Webhook API key not configured")
    if not verify_moonpay_webhook(raw_body, header, api_key):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification.
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    event_type = event.get("type")
    data = event.get("data") or {}

    if event_type == "transaction_created":
        print(f"Buy transaction created: {data.get('id')} ({data.get('status')})")
    elif event_type == "transaction_updated":
        print(f"Buy transaction updated: {data.get('id')} ({data.get('status')})")
    elif event_type == "transaction_failed":
        print(f"Buy transaction failed: {data.get('id')} ({data.get('failureReason')})")
    elif event_type == "sell_transaction_created":
        print(f"Sell transaction created: {data.get('id')} ({data.get('status')})")
    elif event_type == "sell_transaction_updated":
        print(f"Sell transaction updated: {data.get('id')} ({data.get('status')})")
    elif event_type == "sell_transaction_failed":
        print(f"Sell transaction failed: {data.get('id')} ({data.get('failureReason')})")
    elif event_type == "sell_transaction_requote_required":
        print(f"Sell transaction needs a requote: {data.get('id')}")
    elif event_type == "identity_check_updated":
        print(f"Identity check updated: {data.get('id')} ({data.get('status')})")
    elif event_type == "customer.identity_status_updated":  # Platform webhook
        print(f"Customer {data.get('customerId')} identity status: {data.get('status')}")
    else:
        print(f"Unhandled event type: {event_type}")
    # TODO: persist / forward. Delivery is at-least-once and unordered: dedupe on type + data.id +
    # data.updatedAt (Platform events also repeat the `webhook-id` header), and use updatedAt
    # rather than arrival order to decide which state is newer.

    # Respond 2xx within 5 seconds; anything else is a failed delivery and is retried.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
