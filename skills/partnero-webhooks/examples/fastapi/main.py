# Generated with: partnero-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

HEX_SHA256 = re.compile(r"^[0-9a-fA-F]{64}$")


def verify_partnero_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    """Verify a Partnero webhook signature.

    Partnero sends ``Signature: <hex>``: the bare hex HMAC-SHA256 of the raw request body,
    keyed with the webhook's signing secret. Nothing else is signed (no timestamp).
    Both sides are compared as bytes so a non-ASCII header is rejected, not a 500.
    """
    if not signature_header or not secret:
        return False
    # Check the shape first (64 hex chars); hex is case-insensitive, so compare lowercased
    if not HEX_SHA256.fullmatch(signature_header):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.lower().encode("ascii"), expected.encode("ascii"))


@app.post("/webhooks/partnero")
async def partnero_webhook(request: Request):
    secret = os.environ.get("PARTNERO_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Read the raw bytes BEFORE parsing: Partnero signs the exact body (PHP json_encode output)
    raw_body = await request.body()
    signature = request.headers.get("signature")

    if not verify_partnero_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except ValueError:  # includes JSONDecodeError and UnicodeDecodeError
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # The event type is in the body: {event, url, webhook_key, created_at, data}
    event = payload.get("event")
    data = payload.get("data")
    if not isinstance(data, dict):
        data = {}

    if event == "partner.created":
        print(f"New partner {data.get('id')} ({data.get('email')}), status {data.get('status')}")
    elif event == "transaction.created":
        print(f"Transaction {data.get('key')}: {data.get('amount')} {data.get('currency')}")
    elif event in ("reward.created", "reward.approved", "reward.paid"):
        print(f"{event}: reward {data.get('id')} ({data.get('amount')} {data.get('currency')})")
    else:
        print(f"Unhandled Partnero event: {event}")

    # Acknowledge within 5 seconds; failed deliveries are retried (up to 5 attempts)
    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
