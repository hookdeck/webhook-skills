# Generated with: dojah-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

load_dotenv()

app = FastAPI()


def verify_dojah_signature(raw_body: bytes, signature_header, secret: str) -> bool:
    """
    Dojah signs the raw POST body with HMAC-SHA256 keyed on the subscription's
    webhook secret (UTF-8) and sends a bare lowercase hex digest in
    x-dojah-signature (no prefix, no timestamp). x-dojah-signature-v2 is a static
    hash of the secret with no payload, so it is not checked here.
    """
    if not secret or not isinstance(signature_header, str):
        return False

    # Validate the format first: exactly 64 hex characters
    if not re.fullmatch(r"[0-9a-fA-F]{64}", signature_header):
        return False

    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().encode()
    # Compare bytes: compare_digest raises TypeError on non-ASCII str, which would be a 500
    return hmac.compare_digest(expected, signature_header.lower().encode())


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/dojah")
async def dojah_webhook(request: Request):
    # Raw body: parsing JSON first would change the signed bytes
    raw_body = await request.body()

    # Missing, empty, malformed or mismatched signature: 401
    secret = os.getenv("DOJAH_WEBHOOK_SECRET", "")
    if not verify_dojah_signature(raw_body, request.headers.get("x-dojah-signature"), secret):
        return PlainTextResponse("Invalid signature", status_code=401)

    try:
        payload = json.loads(raw_body)
    except ValueError:
        return PlainTextResponse("Invalid JSON", status_code=400)

    # Treat every field as untrusted: check types before reading into the body
    if not isinstance(payload, dict):
        return PlainTextResponse("Invalid payload", status_code=400)

    # No event-name field: the URL is subscribed to one service. For kyc_widget,
    # dispatch on verification_status and look the session up by reference_id.
    reference_id = payload.get("reference_id")
    if not isinstance(reference_id, str):
        reference_id = None
    verification_status = payload.get("verification_status")

    if verification_status == "Completed":
        # Completed means finished, not passed: check the top-level status too
        if payload.get("status") is True:
            print(f"Verification completed and passed: {reference_id}")
        else:
            print(f"Verification completed but not passed: {reference_id}")
    elif verification_status == "Failed":
        print(f"Verification failed: {reference_id}")
    elif verification_status == "Abandoned":
        print(f"Verification abandoned: {reference_id}")
    elif verification_status == "Pending":
        print(f"Verification pending review: {reference_id}")
    elif verification_status == "Ongoing":
        print(f"Verification ongoing: {reference_id}")
    else:
        # Other services (sms, address, AML Monitoring) have their own shapes
        print("Unhandled Dojah event")

    return JSONResponse({"received": True})
