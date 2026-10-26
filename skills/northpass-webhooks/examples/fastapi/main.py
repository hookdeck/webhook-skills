# Generated with: northpass-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Standard base64 of a 32-byte digest: exactly 43 characters plus one "=".
SIGNATURE_FORMAT = re.compile(rb"[A-Za-z0-9+/]{43}=")


def verify_northpass_signature(raw_body: bytes, signature, secret) -> bool:
    """Northpass signs the raw request body with HMAC-SHA256 keyed by the school's
    shared secret and sends the padded base64 digest in X-Northpass-Hmac-SHA256.
    Nothing else is signed (no timestamp), so there is no replay window to check.

    The header is validated for exact format first, then compared as bytes in
    constant time, so a value that merely decodes to the same bytes is rejected.
    """
    if not secret or not signature:
        return False
    try:
        received = signature.encode("ascii")  # compare_digest needs bytes (or ASCII str)
    except UnicodeEncodeError:
        return False
    if not SIGNATURE_FORMAT.fullmatch(received):
        return False

    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(received, base64.b64encode(digest))


# In-memory de-duplication on the event id. Use a durable store in production.
seen: set = set()


def handle_event(event: dict) -> None:
    event_type = event.get("type")
    event_id = event.get("id")
    attributes = event.get("attributes") or {}

    if event_type == "learner_created_events":
        print(f"Learner created (event {event_id})")
        # TODO: create the learner in your system (see data.included for the person)

    elif event_type == "person_activated_events":
        print(f"Person activated (event {event_id})")
        # TODO: mark the learner as active

    elif event_type == "learner_enrolled_to_course_events":
        print(f"Learner enrolled in a course (event {event_id})")
        # TODO: record the enrollment (data.relationships.course / person)

    elif event_type == "learner_started_course_events":
        print(f"Learner started a course (event {event_id})")
        # TODO: record course progress

    elif event_type == "course_completed_events":
        print(f"Course completed (event {event_id})")
        # TODO: issue credit or update the CRM

    elif event_type == "quiz_completed_events":
        print(f"Quiz completed with value {attributes.get('value')} (event {event_id})")
        # TODO: store the score (attributes.value, attributes.minimum_passing_score)

    elif event_type == "course_published_events":
        print(f"Course published, version {attributes.get('version_number')} (event {event_id})")
        # TODO: refresh your course catalog

    else:
        print(f"Unhandled event type: {event_type}")


@app.post("/webhooks/northpass")
async def northpass_webhook(request: Request):
    # Verify the exact bytes received, before any parsing.
    raw_body = await request.body()
    signature = request.headers.get("x-northpass-hmac-sha256")

    if not verify_northpass_signature(raw_body, signature, os.environ.get("NORTHPASS_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid or missing signature")

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON:API body with a data object")

    event_id = event.get("id")
    if event_id and event_id in seen:
        return {"received": True, "duplicate": True}

    try:
        handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Northpass event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    if event_id:
        seen.add(event_id)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
