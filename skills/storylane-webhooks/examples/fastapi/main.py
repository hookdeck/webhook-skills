# Generated with: storylane-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
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

# Standard padded base64 of a 32-byte HMAC-SHA256 digest: 43 chars + "="
BASE64_SHA256 = re.compile(r"[A-Za-z0-9+/]{43}=", re.ASCII)


def verify_storylane_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    """Verify a Storylane webhook signature.

    Storylane sends ``x-storylane-signature: <base64>``: the standard base64 HMAC-SHA256 of the
    raw request body, keyed with the Webhook Verification Secret. Nothing else is signed.
    """
    # Validate the shape first; this also rejects empty, missing and non-ASCII headers
    if not signature_header or not BASE64_SHA256.fullmatch(signature_header):
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    # Compare bytes (never str) and the exact string, so non-canonical base64 is rejected
    return hmac.compare_digest(signature_header.encode("ascii"), expected)


@app.post("/webhooks/storylane")
async def storylane_webhook(request: Request):
    secret = os.environ.get("STORYLANE_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Read the raw bytes BEFORE parsing: the signature covers the exact body (any content type)
    raw_body = await request.body()
    signature = request.headers.get("x-storylane-signature")

    if not verify_storylane_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except ValueError:  # includes JSONDecodeError and UnicodeDecodeError
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Dispatch on the top-level `event` field
    event = payload.get("event")
    if event == "demo_viewed":
        # `lead` is an object for a known visitor and None for an anonymous one
        lead = _as_dict(payload.get("lead"))
        print(
            f"Demo \"{payload.get('name')}\" viewed (session {payload.get('id')}) "
            f"by {lead.get('email', 'an unknown visitor')}"
        )
    else:
        print(f"Unhandled Storylane event: {event}")

    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
