# Generated with: coinbase-commerce-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

webhook_secret = os.environ.get("COINBASE_COMMERCE_WEBHOOK_SECRET", "")


def verify_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """Verify a Coinbase Commerce webhook signature.

    Coinbase Commerce signs the RAW request body with HMAC-SHA256 and sends the
    hex digest in the X-CC-Webhook-Signature header. The official SDK is
    Node-only, so we verify manually here. hmac.compare_digest is timing-safe
    and tolerates length mismatches.
    """
    expected = hmac.new(
        secret.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature or "")


@app.post("/webhooks/coinbase-commerce")
async def coinbase_commerce_webhook(request: Request):
    # Read the RAW body for signature verification (do not parse JSON first).
    raw_body = await request.body()
    signature = request.headers.get("x-cc-webhook-signature")

    if not signature:
        raise HTTPException(
            status_code=400, detail="Missing X-CC-Webhook-Signature header"
        )

    if not verify_signature(raw_body, signature, webhook_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Signature verified - safe to parse. The event is nested under `event`.
    payload = json.loads(raw_body)
    event = payload["event"]
    event_type = event["type"]
    charge = event["data"]

    if event_type == "charge:created":
        print(f"Charge created: {charge['id']}")
        # TODO: Record the pending charge.

    elif event_type == "charge:pending":
        print(f"Charge pending (payment detected): {charge['id']}")
        # TODO: Show a "payment received, confirming" state.

    elif event_type == "charge:confirmed":
        print(f"Charge confirmed: {charge['id']}")
        # TODO: Fulfill the order, grant access, send a receipt.

    elif event_type == "charge:failed":
        print(f"Charge failed: {charge['id']}")
        # TODO: Cancel the order, notify the customer.

    elif event_type == "charge:delayed":
        print(f"Charge delayed (late/under/overpaid): {charge['id']}")
        # TODO: Flag for manual review.

    elif event_type == "charge:resolved":
        print(f"Charge resolved: {charge['id']}")
        # TODO: Complete or refund based on the resolution.

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
