# Generated with: aiprise-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

aiprise_api_key = os.environ.get("AIPRISE_API_KEY")


def verify_aiprise_webhook(raw_body: bytes, signature_header: str, api_key: str) -> bool:
    """Verify an AiPrise callback signature.

    AiPrise signs the raw request body with HMAC-SHA256 using your API private key
    and sends the lowercase hex digest in the X-HMAC-SIGNATURE header. There is no
    separate webhook secret — the signing key IS the API private key.
    """
    if not signature_header:
        return False

    expected_signature = hmac.new(
        api_key.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest().lower()

    # Timing-safe comparison.
    return hmac.compare_digest(signature_header.lower(), expected_signature)


@app.post("/webhooks/aiprise")
async def aiprise_webhook(request: Request):
    # Read the raw body for signature verification — do NOT parse it first.
    raw_body = await request.body()
    signature_header = request.headers.get("x-hmac-signature")

    # Verify the signature before trusting the payload.
    if not verify_aiprise_webhook(raw_body, signature_header, aiprise_api_key):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload only after verification.
    payload = json.loads(raw_body)
    # Event callbacks (events_callback_url) and token sharing webhooks name their
    # event in one of these fields. A decision callback (callback_url) has none.
    event_type = (
        payload.get("event_type")
        or payload.get("user_profile_event_type")
        or payload.get("business_profile_event_type")
        or payload.get("token_sharing_event_type")
    )
    if event_type:
        print(f"AiPrise event {event_type}")
        # Your code: handle the events you use, such as CASE_STATUS_UPDATE.
        return {"received": True}

    # Decision callback: the final result of a verification session.
    session_id = payload.get("verification_session_id")
    client_ref = payload.get("client_reference_id")
    # The API reference names this field verification_result; AiPrise's callback
    # pages print aiprise_summary.decision instead, so read both.
    summary = payload.get("aiprise_summary") or {}
    result = summary.get("verification_result") or summary.get("decision")

    ref = f" (ref: {client_ref})" if client_ref else ""
    print(f"AiPrise callback for session {session_id}{ref} -> {result}")

    if result == "APPROVED":
        print("Verification approved")
        # Your code: Provision access, mark the customer verified.

    elif result == "DECLINED":
        print("Verification declined")
        # Your code: Block onboarding, request resubmission, flag for review.

    elif result in ("REVIEW", "MANUAL_REVIEW"):
        print("Verification needs manual review")
        # Your code: Route to a human analyst / compliance queue.

    elif result in ("UNKNOWN", "FAILED"):
        print("Verification result unknown")
        # Your code: Retry or investigate.

    else:
        print(f"Unhandled result: {result}")

    # Return 200 to acknowledge receipt.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
