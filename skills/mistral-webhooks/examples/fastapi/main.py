import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()

SIGNATURE_PREFIX = "hmac-sha256="


def verify_mistral_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify `x-mistral-signature: hmac-sha256=<hex>` (HMAC-SHA256 of the raw body, UTF-8 secret)."""
    if not signature_header or not secret or not signature_header.startswith(SIGNATURE_PREFIX):
        return False

    received = signature_header.removeprefix(SIGNATURE_PREFIX)
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(received.encode(), expected.encode())


@app.post("/webhooks/mistral")
async def mistral_webhook(
    request: Request,
    x_mistral_signature: str | None = Header(default=None),
):
    # Raw body is required for signature verification
    raw_body = await request.body()

    if not x_mistral_signature:
        raise HTTPException(status_code=400, detail="Missing x-mistral-signature header")

    if not verify_mistral_webhook(raw_body, x_mistral_signature, os.environ.get("MISTRAL_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event")
    data = payload.get("data") or {}

    # Retries can deliver the same event twice: dedupe on session_id + event in production
    if event == "call_started":
        print(f"Call started: {data.get('session_id')} (agent {data.get('agent_id')})")
        # TODO: open a call record
    elif event == "call_ended":
        print(f"Call ended: {data.get('session_id')} after {data.get('duration_seconds')}s")
        # transcript is best effort and may be None
        # TODO: store transcript, update CRM
    elif event == "call_failed":
        print(f"Call failed: {data.get('session_id')} ({data.get('error')})")
        # TODO: alert, track failure
    else:
        print(f"Unhandled event: {event}")

    # Acknowledge quickly; Mistral times out after 10 seconds
    return {"status": "ok"}


@app.get("/health")
async def health():
    return {"status": "ok"}
