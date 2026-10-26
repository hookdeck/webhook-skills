# Generated with: jazzhr-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_signature(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """JazzHR signs the raw body with HMAC-SHA256 (bare hex) in X-JazzHR-Signature."""
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes so a non-ASCII header fails verification instead of raising TypeError.
    return hmac.compare_digest(signature_header.lower().encode(), expected.encode())


@app.post("/webhooks/jazzhr")
async def jazzhr_webhook(request: Request):
    # Raw bytes, whatever the Content-Type
    raw_body = await request.body()

    if not verify_signature(
        raw_body,
        request.headers.get("x-jazzhr-signature"),
        os.getenv("JAZZHR_WEBHOOK_SECRET"),
    ):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # The event type is in a header, not the body.
    event_type = request.headers.get("x-jazzhr-event")

    if event_type == "VERIFY":
        # Signed setup POST sent when the integration is saved; only needs a 200.
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if event_type == "CANDIDATE-EXPORT":
        candidate = payload.get("candidate") or {}
        person_id = ((candidate.get("person") or {}).get("id") or {}).get("value")
        print("Candidate exported:", person_id, request.headers.get("x-jazzhr-uuid"))
    else:
        print("Unhandled event:", event_type)

    # Any 2xx acknowledges the delivery.
    return {"received": True}
