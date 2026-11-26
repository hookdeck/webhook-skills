import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

webhook_secret = os.environ.get("ASCEND_WEBHOOK_SECRET", "")


def verify_ascend_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    """Verify an Ascend webhook signature.

    Ascend sends ``X-Ascend-Signature: t=<timestamp>,v1=<hex_hmac_sha256>``.
    The signed string is ``<timestamp>:<raw_body>`` (colon separator, RAW body).
    There is no official Ascend SDK, so we verify manually with ``hmac``.
    """
    if not signature_header:
        return False

    parts: dict[str, str] = {}
    for part in signature_header.split(","):
        key, _, value = part.partition("=")
        parts[key.strip()] = value.strip()

    timestamp = parts.get("t")
    signature = parts.get("v1")
    if not timestamp or not signature:
        return False

    signed = f"{timestamp}:".encode("utf-8") + raw_body  # colon separator + RAW body
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


@app.post("/webhooks/ascend")
async def ascend_webhook(request: Request):
    # Read the RAW body for signature verification (do not parse first).
    raw_body = await request.body()
    signature_header = request.headers.get("x-ascend-signature")

    if not verify_ascend_signature(raw_body, signature_header, webhook_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Ascend payloads are { id, type, data }. `data` IS the resource object
    # (no Stripe-style `data.object` wrapper).
    event_type = event.get("type")
    data = event.get("data", {})

    if event_type == "invoice.paid":
        print(f"Invoice paid: {data.get('id')} {data.get('invoice_number')}")
        # Your code: Record payment, update billing history, unlock coverage.

    elif event_type == "invoice.voided":
        print(f"Invoice voided: {data.get('id')}")
        # Your code: Reverse the local billing record.

    elif event_type == "payout.paid":
        print(f"Payout paid: {data.get('id')}")
        # Your code: Reconcile payouts, update accounting ledger.

    elif event_type == "refund.paid":
        print(f"Refund paid: {data.get('id')}")
        # Your code: Update policy/billing records, notify the customer.

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 200 to acknowledge receipt.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
