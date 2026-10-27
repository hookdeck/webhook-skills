# Generated with: surveymethods-webhooks skill
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


def verify_surveymethods_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    """Verify a SurveyMethods webhook signature.

    SurveyMethods sends ``X-SurveyMethods-Signature: sha256=<hex>`` where <hex> is the HMAC-SHA256
    of the raw request body keyed with the webhook's signing secret. The bare digest is accepted too.
    Both sides are compared as bytes so a non-ASCII header is rejected, not a 500.
    """
    if not signature_header or not secret:
        return False
    received = signature_header.strip()
    if received.startswith("sha256="):
        received = received[len("sha256="):]
    if not re.fullmatch(r"[0-9a-fA-F]{64}", received):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(received.lower().encode("utf-8"), expected.encode("utf-8"))


@app.post("/webhooks/surveymethods")
async def surveymethods_webhook(request: Request):
    secret = os.environ.get("SURVEYMETHODS_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Read the raw body BEFORE parsing: the signature covers the exact bytes (any content type)
    raw_body = await request.body()
    signature = request.headers.get("x-surveymethods-signature")

    if not verify_surveymethods_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except ValueError:  # includes JSONDecodeError and UnicodeDecodeError
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid event")

    # Delivery is at-least-once (up to 5 attempts): deduplicate on event["eventId"]
    event_type = event.get("eventType")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    event_id = event.get("eventId")
    if event_type == "response.completed":
        print(f"Response completed on survey {data.get('surveyId')} (event {event_id})")
    elif event_type == "response.created":
        print(f"Response started on survey {data.get('surveyId')} (event {event_id})")
    elif event_type == "survey.created":
        print(f"Survey created: {data.get('surveyId')} (event {event_id})")
    elif event_type == "collector.created":
        print(f"Collector created: {data.get('collectorId')} (event {event_id})")
    else:
        print(f"Unhandled SurveyMethods event: {event_type}")

    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
