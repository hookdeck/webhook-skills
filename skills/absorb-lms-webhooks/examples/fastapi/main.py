# Generated with: absorb-lms-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_absorb_signature(raw_body: bytes, signature, secret=None) -> bool:
    """Absorb LMS sends absorb-signature: bare lowercase hex HMAC-SHA256 of the raw request
    body, keyed with the webhook's Secret Key used as a UTF-8 string (no prefix, no timestamp).
    Both sides are compared as bytes: compare_digest raises TypeError on a non-ASCII str,
    which would turn a bad header into a 500 instead of a 401. Hex is case-insensitive, so the
    header is lowercased first."""
    if secret is None:
        secret = os.environ.get("ABSORB_WEBHOOK_SECRET")
    if not secret or not isinstance(signature, str):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode("utf-8"), signature.lower().encode("utf-8"))


def handle_event(body: dict) -> None:
    event_name = body.get("eventName")
    # Absorb's docs show only UserCreated and CertificateAwarded on the wire, so the casing
    # of the other names is untested. Compare case-insensitively.
    key = str(event_name or "").lower()

    if key == "usercreated":
        print("User created", body)
        # GET the new learner from the Absorb Integration API and sync it

    elif key == "onlinecourseactivated":
        print("Online course activated", body)

    elif key in ("enrollmentcompletedbyadmin", "enrollmentcompletedbylearner"):
        print(f"Enrollment completed ({event_name})", body)
        # Mark the course complete in your system

    elif key == "certificateawarded":
        print("Certificate awarded", body)
        # Fetch the certificate and notify the learner

    elif key == "competencyawarded":
        print("Competency awarded", body)

    elif key == "coursecreditsawarded":
        print("Course credits awarded", body)

    elif key in ("userenrolledincoursebyadmin", "userenrolledincoursebylearner"):
        print(f"User enrolled in course ({event_name})", body)

    else:
        print(f"Unhandled event: {event_name}")


@app.post("/webhooks/absorb-lms")
async def absorb_webhook(request: Request):
    # Raw bytes, whatever the content type: the signature covers exactly these.
    raw_body = await request.body()

    if not verify_absorb_signature(raw_body, request.headers.get("absorb-signature")):
        # Absorb's Test Webhook button sends a random signature, so it always lands here.
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(body)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Absorb LMS event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
