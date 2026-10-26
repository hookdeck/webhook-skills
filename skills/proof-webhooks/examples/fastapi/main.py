# Generated with: proof-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

SIGNATURE_PATTERN = re.compile(r"[0-9a-fA-F]{64}")


def verify_proof_signature(raw_body: bytes, signature: str | None, secret: str) -> bool:
    """Verify a Proof webhook signature.

    Proof sends the bare lowercase hex HMAC-SHA256 of the raw request body in the
    ``X-Notarize-Signature`` header. The key is the API key that created the
    subscription, or its ``signing_key``. No timestamp is signed.
    """
    if not signature or not secret:
        return False
    # Exactly 64 hex characters before comparing
    if SIGNATURE_PATTERN.fullmatch(signature) is None:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Timing-safe comparison on bytes (str would raise on non-ASCII)
    return hmac.compare_digest(expected.encode("ascii"), signature.lower().encode("ascii"))


@app.post("/webhooks/proof")
async def proof_webhook(request: Request):
    # Read the raw bytes for signature verification: do not parse the JSON first
    raw_body = await request.body()
    signature = request.headers.get("x-notarize-signature")

    if not signature:
        raise HTTPException(status_code=401, detail="Missing X-Notarize-Signature header")

    secret = os.environ.get("PROOF_WEBHOOK_SECRET", "")
    if not verify_proof_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Signature is valid: now it is safe to parse the body
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event")
    data = _as_dict(payload.get("data"))

    if event == "transaction.created":
        print(f"Transaction created: {data.get('transaction_id')}")
        # TODO: Record the transaction in your system

    elif event == "transaction.completed":
        print(f"Transaction completed: {data.get('transaction_id')}")
        # TODO: Update state. Documents may not be downloadable yet: wait for transaction.released

    elif event == "transaction.released":
        print(f"Transaction released: {data.get('transaction_id')}")
        # TODO: Fetch the signed documents from the Proof API

    elif event == "transaction.declined":
        print(f"Transaction declined: {data.get('transaction_id')}")
        # TODO: Notify the requester

    elif event == "notary.created":
        print(f"Notary created: {data.get('notary_id')}")
        # TODO: Sync the notary to your system

    else:
        print(f"Unhandled event: {event}")

    # Only a 200 acknowledges; anything else is retried (up to 16 attempts over 48 hours).
    # Deliveries can repeat and arrive out of order, so keep handlers idempotent.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
