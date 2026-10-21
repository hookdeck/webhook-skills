# Generated with: maxio-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import os
from typing import Optional
from urllib.parse import parse_qsl

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_maxio(raw_body: bytes, signature_header: Optional[str], shared_key: Optional[str]) -> bool:
    """Header X-Chargify-Webhook-Signature-Hmac-Sha-256 = hex HMAC-SHA256 of the
    raw form body, keyed with the Site Shared Key (raw string)."""
    if not signature_header or not shared_key:
        return False
    expected = hmac.new(shared_key.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header.strip().lower())


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/maxio")
async def maxio_webhook(
    request: Request,
    x_chargify_webhook_signature_hmac_sha_256: Optional[str] = Header(default=None),
):
    shared_key = os.environ.get("MAXIO_SHARED_KEY")
    if not shared_key:
        raise HTTPException(status_code=500, detail="Webhook verification not configured")

    if not x_chargify_webhook_signature_hmac_sha_256:
        raise HTTPException(status_code=400, detail="Missing signature header")

    # Raw body: the signature covers the exact form-encoded bytes.
    raw_body = await request.body()
    if not verify_maxio(raw_body, x_chargify_webhook_signature_hmac_sha_256, shared_key):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the form only after verification.
    form = dict(parse_qsl(raw_body.decode("utf-8"), keep_blank_values=True))
    event = form.get("event")

    if event == "signup_success":
        print("Signup succeeded")
    elif event == "payment_success":
        print("Payment succeeded")
    elif event == "payment_failure":
        print("Payment failed")
    elif event == "renewal_success":
        print("Renewal succeeded")
    elif event == "subscription_state_change":
        print("Subscription state changed")
    elif event == "test":
        print("Test webhook received")
    else:
        print(f"Unhandled event: {event}")

    return {"received": True}
