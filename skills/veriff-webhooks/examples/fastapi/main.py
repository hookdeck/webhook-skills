# Generated with: veriff-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_veriff_signature(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify a Veriff webhook signature.

    Veriff sends X-HMAC-SIGNATURE: lowercase hex HMAC-SHA256 of the RAW request body,
    keyed with the integration's shared secret key (used as a plain string).
    """
    if not signature_header or not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # Normalise case, then compare in constant time
    return hmac.compare_digest(signature_header.strip().lower().encode(), expected.encode())


def handle_decision(payload: dict) -> None:
    """Decision webhook: verification.status values."""
    verification = payload.get("verification")
    if not verification:
        # Veriff sends verification: null while a decision is not yet available
        print("Decision webhook without a verification object")
        return

    status = verification.get("status")
    ref = (
        f"session {verification.get('id')} (attempt {verification.get('attemptId')}, "
        f"vendorData {verification.get('vendorData')})"
    )

    if status == "approved":
        print(f"Verification approved: {ref}")
        # TODO: Mark the end-user as verified
    elif status == "declined":
        print(f"Verification declined: {ref}, reason: {verification.get('reason')}")
        # TODO: Reject the end-user, log reasonCode
    elif status == "resubmission_requested":
        print(f"Resubmission requested: {ref}, reason: {verification.get('reason')}")
        # TODO: Ask the end-user to retry with the same session
    elif status == "review":
        print(f"Verification in review: {ref}")
    elif status == "expired":
        print(f"Verification expired: {ref}")
    elif status == "abandoned":
        print(f"Verification abandoned: {ref}")
    else:
        print(f"Unhandled decision status: {status}")


def handle_event(payload: dict) -> None:
    """Event webhook: action values."""
    action = payload.get("action")
    ref = f"session {payload.get('id')} (attempt {payload.get('attemptId')})"

    if action == "started":
        print(f"End-user started the flow: {ref}")
    elif action == "submitted":
        print(f"End-user submitted the attempt: {ref}")
        # TODO: Show a "waiting for decision" state
    elif action in (
        "waiting_continued",
        "waiting_complete",
        "flow_finished",
        "flow_cancelled",
        "document_type_other_selected",
    ):
        print(f"Flow event {action}: {ref}")
    else:
        print(f"Unhandled event action: {action}")


@app.post("/webhooks/veriff")
async def veriff_webhook(request: Request):
    secret = os.getenv("VERIFF_SHARED_SECRET")
    if not secret:
        print("VERIFF_SHARED_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    signature = request.headers.get("x-hmac-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-HMAC-SIGNATURE header")

    # Read the RAW body: Veriff signs the exact bytes it sent
    raw_body = await request.body()

    if not verify_veriff_signature(raw_body, signature, secret):
        print("Veriff signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after the signature is verified
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Decision webhooks carry a `verification` object; event webhooks carry `action`
    if "verification" in payload:
        handle_decision(payload)
    elif payload.get("action"):
        handle_event(payload)
    else:
        print("Unhandled Veriff webhook type")

    # Veriff expects a 200 within 5 seconds, otherwise it retries for up to a week
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
