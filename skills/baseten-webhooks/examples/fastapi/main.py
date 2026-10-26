# Generated with: baseten-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()

HEX_64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_baseten_signature(raw_body: bytes, header: str | None, secret: str | None) -> bool:
    """X-BASETEN-SIGNATURE: v1=<hex>. HMAC-SHA256 of the raw body bytes, keyed with
    the secret's UTF-8 bytes. Nothing else is signed, so there is no timestamp
    window. During rotation the header may hold several comma-separated values."""
    if not header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    for part in header.split(","):
        sig = part.strip().removeprefix("v1=")
        # Validate length and alphabet before decoding
        if HEX_64.fullmatch(sig) and hmac.compare_digest(bytes.fromhex(sig), expected):
            return True
    return False


def handle_async_request_completed(event: dict) -> str:
    """Success and failure share the same event type; `data` and `errors` tell them apart."""
    errors = event.get("errors")
    if not event.get("data") or (isinstance(errors, list) and errors):
        print(f"Async request {event.get('request_id')} failed: {json.dumps(errors)}")
        return "failed"
    print(f"Async request {event.get('request_id')} completed for model {event.get('model_id')}")
    return "succeeded"


async def verified_body(
    request: Request,
    x_baseten_signature: str | None = Header(default=None),
) -> bytes:
    """Dependency: read the raw bytes and verify before anything parses them."""
    secret = os.environ.get("BASETEN_WEBHOOK_SECRET")
    if not secret:
        print("BASETEN_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    if not x_baseten_signature:
        raise HTTPException(status_code=401, detail="Missing X-BASETEN-SIGNATURE header")

    raw_body = await request.body()
    if not verify_baseten_signature(raw_body, x_baseten_signature, secret):
        print("Baseten signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    return raw_body


@app.post("/webhooks/baseten")
async def baseten_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if event.get("type") == "async_request_completed":
        return {"received": True, "outcome": handle_async_request_completed(event)}

    print(f"Unhandled Baseten event type: {event.get('type')}")
    return {"received": True, "outcome": "ignored"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
