# Generated with: reditus-webhooks skill
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

# Reditus's docs don't name the HTTP method, so accept every method a sender might use.
METHODS = ["POST", "PUT", "PATCH", "GET", "DELETE"]

SIGNATURE_RE = re.compile(r"[0-9a-fA-F]{64}")


def verify_reditus_signature(raw_body: bytes, signature, secret=None) -> bool:
    """Verify the X-Signature header: lowercase hex HMAC-SHA256 of the raw body bytes,
    keyed with the webhook secret's UTF-8 bytes. Nothing else is signed (no timestamp, no id).
    """
    secret = secret if secret is not None else os.environ.get("REDITUS_WEBHOOK_SECRET")
    if not secret or not isinstance(signature, str):
        return False
    # Validate length and alphabet before decoding.
    if not SIGNATURE_RE.fullmatch(signature):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    received = bytes.fromhex(signature)  # case-insensitive, as Hookdeck does
    return hmac.compare_digest(received, expected)  # bytes, never str


def text(value):
    """Parsed fields are untrusted: only use values of the expected type."""
    return value if isinstance(value, str) else None


def handle_event(payload: dict) -> None:
    event_type = text(payload.get("event_type"))
    data = payload.get("data")
    if not isinstance(data, dict):
        data = {}

    if event_type == "partnership.accepted":
        print(f"Partnership accepted: {text(data.get('affiliate_email'))}")
        # TODO: activate the affiliate in your system

    elif event_type == "referral.created":
        print(f"Referral created: {text(data.get('referral_id'))} (affiliate {text(data.get('affiliate_email'))})")
        # TODO: record the referral

    elif event_type == "advocate.created":
        print(f"Advocate created: {text(data.get('advocate_id'))} ({text(data.get('advocate_email'))})")
        # TODO: send the advocate their referral link

    elif event_type == "lead.created":
        print(f"Lead created: {text(data.get('lead_id'))} for advocate {text(data.get('advocate_uid'))}")
        # TODO: attribute the lead to the advocate

    elif event_type == "reward.created":
        # The docs' sample shows amount 5521 as $55.21, i.e. minor units.
        amount = data.get("amount")
        if isinstance(amount, bool) or not isinstance(amount, (int, float)):
            amount = None
        print(f"Reward created: {text(data.get('reward_id'))} amount={amount} {text(data.get('currency'))}")
        # TODO: grant the reward

    else:
        print(f"Unhandled event: {event_type}")


@app.api_route("/webhooks/reditus", methods=METHODS)
async def reditus_webhook(request: Request):
    # Raw bytes, never decoded and re-encoded; a request with no body is zero bytes.
    raw_body = await request.body()

    if not verify_reditus_signature(raw_body, request.headers.get("x-signature")):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Signature")

    if len(raw_body) == 0:
        print(f"{request.method} webhook with empty body")
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Reditus webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
