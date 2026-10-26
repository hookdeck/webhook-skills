# Generated with: tutorcruncher-webhooks skill
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

# TutorCruncher's docs don't name the HTTP method, so accept all of these.
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

HEX_DIGEST = re.compile(r"[0-9a-fA-F]{64}")


def verify_tutorcruncher_signature(raw_body: bytes, signature, secret=None) -> bool:
    """Webhook-Signature is the bare lowercase hex HMAC-SHA256 of the raw body, keyed with
    the integration's private API key (UTF-8 bytes, used as-is). No prefix, id or timestamp.
    Not Standard Webhooks, despite the header name.
    """
    secret = secret if secret is not None else os.environ.get("TUTORCRUNCHER_WEBHOOK_SECRET")
    if not secret or not isinstance(signature, str) or not HEX_DIGEST.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # compare_digest on bytes (str raises on non-ASCII); hex is case-insensitive
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))


# One webhook carries {"events": [...]}; each element has its own "action".
def handle_event(event: dict) -> None:
    action = event.get("action")
    subject = event.get("subject")
    if not isinstance(subject, dict):
        subject = {}

    if action == "CREATED_A_CONTRACTOR":
        print(f"Tutor created: {subject.get('id')} ({subject.get('email')})")
        # TODO: onboard the tutor in your system

    elif action == "CHANGED_CONTRACTOR_STATUS":
        print(f"Tutor status changed: {subject.get('id')} -> {subject.get('status')}")
        # TODO: sync the tutor's status

    elif action == "CLIENT_ENQUIRY":
        print(f"Client enquiry from: {subject.get('id')}")
        # TODO: create a lead

    elif action == "CREATED_AN_APPOINTMENT":
        print(f"Lesson created: {subject.get('id')}")
        # TODO: sync to your calendar

    elif action == "RAISED_INVOICE":
        print(f"Invoice raised: {subject.get('id')}")
        # TODO: push to accounting

    else:
        print(f"Unhandled action: {action}")


@app.api_route("/webhooks/tutorcruncher", methods=METHODS)
async def tutorcruncher_webhook(request: Request):
    # Raw bytes, any content type; a request with no body is verified over zero bytes.
    raw_body = await request.body()

    if not verify_tutorcruncher_signature(raw_body, request.headers.get("webhook-signature")):
        raise HTTPException(status_code=401, detail="Invalid or missing signature")

    # Verified and empty (e.g. GET): acknowledge.
    if not raw_body:
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Treat every field as untrusted: check types before reading into them.
    if not isinstance(payload, dict) or not isinstance(payload.get("events"), list):
        raise HTTPException(status_code=400, detail='Expected {"events": [...]}')

    try:
        for event in payload["events"]:
            if isinstance(event, dict) and isinstance(event.get("action"), str):
                handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling TutorCruncher webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
