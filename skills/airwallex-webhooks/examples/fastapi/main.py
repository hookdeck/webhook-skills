# Generated with: airwallex-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

WEBHOOK_SECRET = os.environ.get("AIRWALLEX_WEBHOOK_SECRET", "")

# Airwallex's x-timestamp is in MILLISECONDS. The docs don't mandate a window;
# 5 minutes (300_000 ms) tolerates retries and clock skew.
TOLERANCE_MS = 5 * 60 * 1000


def verify_airwallex_signature(
    raw_body: bytes, timestamp: str, signature: str, secret: str
) -> bool:
    """Verify an Airwallex webhook signature.

    Airwallex computes HMAC-SHA256 over `x-timestamp + raw_body` (timestamp
    first), keyed with the endpoint secret, and sends the hex digest as the
    `x-signature` header. Always hash the raw, unmodified body.
    """
    if not timestamp or not signature:
        return False
    message = timestamp.encode("utf-8") + raw_body
    expected = hmac.new(
        secret.encode("utf-8"), message, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)  # constant-time


@app.post("/webhooks/airwallex")
async def airwallex_webhook(request: Request):
    # Read the RAW body first — required for signature verification.
    raw_body = await request.body()
    timestamp = request.headers.get("x-timestamp")
    signature = request.headers.get("x-signature")

    if not timestamp or not signature:
        return Response("Missing x-timestamp or x-signature header", status_code=400)

    # Optional replay protection.
    if abs(int(time.time() * 1000) - int(timestamp)) > TOLERANCE_MS:
        return Response("Timestamp outside tolerance", status_code=400)

    # Verify BEFORE parsing.
    if not verify_airwallex_signature(raw_body, timestamp, signature, WEBHOOK_SECRET):
        return Response("Invalid signature", status_code=400)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response("Invalid JSON", status_code=400)

    # Dispatch on the event `name` (Airwallex uses `name`, not `type`).
    # The changed resource lives in data.object.
    event_name = event.get("name")
    resource = (event.get("data") or {}).get("object") or {}

    if event_name == "payment_intent.succeeded":
        print(f"PaymentIntent succeeded: {resource.get('id')}")
        # Your code: fulfill the order, send a receipt, etc.
    elif event_name == "payment_attempt.paid":
        print(f"Payment attempt paid: {resource.get('id')}")
        # Your code: mark the attempt as paid.
    elif event_name == "refund.settled":
        print(f"Refund settled: {resource.get('id')}")
        # Your code: reconcile the refund.
    elif event_name == "refund.failed":
        print(f"Refund failed: {resource.get('id')}")
        # Your code: alert / retry the refund.
    elif event_name == "payment_consent.verified":
        print(f"Payment consent verified: {resource.get('id')}")
        # Your code: enable recurring / merchant-initiated payments.
    elif event_name == "payment_dispute.requires_response":
        print(f"Dispute requires response: {resource.get('id')}")
        # Your code: gather and submit evidence before the deadline.
    else:
        print(f"Unhandled event type: {event_name}")

    # Acknowledge quickly; do heavy work asynchronously.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
