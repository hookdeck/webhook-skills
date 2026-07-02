# Generated with: razorpay-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

razorpay_secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")


def verify_razorpay_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify a Razorpay webhook signature.

    Razorpay has no Python SDK helper for webhooks, so we verify manually:
    HMAC-SHA256 (hex) over the RAW request body, keyed with the webhook secret,
    compared against the X-Razorpay-Signature header using a timing-safe compare.
    """
    if not signature_header:
        return False

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,  # raw bytes, NOT parsed JSON
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected_signature, signature_header)


@app.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request):
    # Read the RAW body for signature verification (do not parse first)
    raw_body = await request.body()
    signature_header = request.headers.get("x-razorpay-signature")

    # Verify the signature BEFORE parsing the body
    if not verify_razorpay_webhook(raw_body, signature_header, razorpay_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification succeeds
    payload = json.loads(raw_body)
    event = payload.get("event")

    print(f"Received {event} event (created_at: {payload.get('created_at')})")

    # The event type is in the body's `event` field, not a header.
    if event == "payment.authorized":
        payment = payload["payload"]["payment"]["entity"]
        print(f"Payment authorized: {payment['id']} ({payment['amount']} {payment['currency']})")
        # TODO: Capture the payment or hold for review.

    elif event == "payment.captured":
        payment = payload["payload"]["payment"]["entity"]
        print(f"Payment captured: {payment['id']} ({payment['amount']} {payment['currency']})")
        # TODO: Fulfil the order, grant access, send a receipt.

    elif event == "payment.failed":
        payment = payload["payload"]["payment"]["entity"]
        print(f"Payment failed: {payment['id']} ({payment.get('error_description', 'unknown error')})")
        # TODO: Notify the customer, offer a retry.

    elif event == "order.paid":
        order = payload["payload"]["order"]["entity"]
        print(f"Order paid: {order['id']} (amount_paid: {order['amount_paid']})")
        # TODO: Mark the order complete, start fulfilment.

    elif event == "refund.processed":
        refund = payload["payload"]["refund"]["entity"]
        print(f"Refund processed: {refund['id']} for payment {refund['payment_id']}")
        # TODO: Update your ledger, notify the customer.

    elif event == "subscription.charged":
        subscription = payload["payload"]["subscription"]["entity"]
        print(f"Subscription charged: {subscription['id']}")
        # TODO: Extend access, issue an invoice.

    else:
        print(f"Unhandled event: {event}")

    # Return 2xx to acknowledge receipt (Razorpay retries otherwise)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
