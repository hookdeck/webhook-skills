# Generated with: ziina-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

_HEX64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_ziina_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """X-Hmac-Signature is the bare hex HMAC-SHA256 of the raw body, keyed with the secret's UTF-8 bytes."""
    # Validate the format before decoding: exactly 64 hex characters.
    if not secret or not signature_header or not _HEX64.fullmatch(signature_header):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature_header), expected)


@app.post("/webhooks/ziina")
async def ziina_webhook(request: Request, x_hmac_signature: str | None = Header(default=None)):
    # Raw bytes, not request.json(): the signature covers the exact body.
    raw_body = await request.body()

    if not verify_ziina_webhook(raw_body, x_hmac_signature, os.getenv("ZIINA_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification.
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name does not change with the status; the new state is in data.status.
    data = _as_dict(payload.get("data"))
    status = data.get("status")
    event = payload.get("event")
    if event == "payment_intent.status.updated":
        print(f"Payment intent {data.get('id')} is now {status}")
        # TODO: if status is 'completed', mark the order paid.
    elif event == "refund.status.updated":
        print(f"Refund {data.get('id')} is now {status}")
        # TODO: update the refund state in your system.
    else:
        print(f"Unhandled Ziina event: {event}")

    return {"status": "ok"}


@app.get("/health")
async def health():
    return {"status": "ok"}
