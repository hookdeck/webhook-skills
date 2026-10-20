# Generated with: sumsub-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Sumsub announces the HMAC algorithm per webhook in x-payload-digest-alg.
# SHA256 is the default for new webhooks; older webhooks still send SHA1.
DIGEST_ALGORITHMS = {
    "HMAC_SHA1_HEX": hashlib.sha1,
    "HMAC_SHA256_HEX": hashlib.sha256,
    "HMAC_SHA512_HEX": hashlib.sha512,
}


def verify_sumsub_webhook(
    raw_body: bytes, digest: str | None, digest_alg: str | None, secret: str | None
) -> bool:
    """Verify x-payload-digest: hex HMAC of the raw body keyed with the webhook's secret key."""
    if not digest or not secret:
        return False

    # An absent alg header means SHA256; an unknown value is rejected
    algorithm = DIGEST_ALGORITHMS.get(digest_alg or "HMAC_SHA256_HEX")
    if algorithm is None:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, algorithm).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(digest.strip().lower(), expected)


async def verified_sumsub_payload(request: Request) -> dict[str, Any]:
    """FastAPI dependency: verify the digest on the raw body, then parse JSON."""
    secret = os.environ.get("SUMSUB_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    digest = request.headers.get("x-payload-digest")
    digest_alg = request.headers.get("x-payload-digest-alg")
    if not digest:
        raise HTTPException(status_code=400, detail="Missing x-payload-digest header")

    # Raw bytes, exactly as received - never re-serialise parsed JSON
    raw_body = await request.body()

    # Return 400 (not 401): Sumsub treats 401/403/404 as permanent and stops retrying
    if not verify_sumsub_webhook(raw_body, digest, digest_alg, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        return json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")


@app.post("/webhooks/sumsub")
async def sumsub_webhook(payload: dict[str, Any] = Depends(verified_sumsub_payload)):
    event_type = payload.get("type")
    applicant_id = payload.get("applicantId")
    review_result = payload.get("reviewResult") or {}

    # testMode is only present (true) on deliveries sent with "Test webhook" in the Webhook manager
    if payload.get("testMode"):
        print("Test webhook from the Webhook manager")

    print(
        f"Received {event_type} for applicant {applicant_id} "
        f"(externalUserId: {payload.get('externalUserId')}, sandbox: {bool(payload.get('sandboxMode'))})"
    )

    # Route on the body's type field (Sumsub sends no event-type header)
    if event_type == "applicantCreated":
        print(f"Applicant created, review status: {payload.get('reviewStatus')}")
        # TODO: Link applicantId to your user record

    elif event_type == "applicantPending":
        print("Applicant submitted documents, review pending")
        # TODO: Show "verification in progress" to the user

    elif event_type == "applicantReviewed":
        # reviewAnswer is GREEN (approved) or RED (rejected)
        answer = review_result.get("reviewAnswer")
        if answer == "GREEN":
            print("Applicant approved")
            # TODO: Unlock verified features
        elif answer == "RED":
            # RETRY = user can resubmit, FINAL = permanently rejected
            print(f"Applicant rejected: {review_result.get('reviewRejectType')}")
            # TODO: Ask for resubmission or block the account

    elif event_type == "applicantOnHold":
        print("Applicant on hold, manual review required")
        # TODO: Flag for compliance team

    elif event_type == "applicantActionPending":
        print(f"Applicant action pending: {payload.get('applicantActionId')}")

    elif event_type == "applicantActionReviewed":
        print(f"Applicant action reviewed: {payload.get('applicantActionId')} {review_result.get('reviewAnswer')}")
        # TODO: Apply the action result (e.g. payment method check)

    elif event_type == "applicantReset":
        print("Applicant reset")
        # TODO: Clear cached verification state

    elif event_type == "applicantDeleted":
        print("Applicant deleted")
        # TODO: Remove local references to the applicant

    else:
        print(f"Unhandled event type: {event_type}")

    # Acknowledge quickly: Sumsub expects a response within 10 seconds
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
