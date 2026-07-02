# Generated with: zoom-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

zoom_secret_token = os.environ.get("ZOOM_WEBHOOK_SECRET_TOKEN", "")


def verify_zoom_webhook(
    raw_body: bytes, timestamp: str, signature: str, secret_token: str
) -> bool:
    """Verify a Zoom webhook signature.

    Zoom signs `v0:{timestamp}:{rawBody}` with HMAC-SHA256 keyed on the app's
    Secret Token and sends it in the `x-zm-signature` header as `v0=<hex>`.
    """
    if not timestamp or not signature:
        return False

    message = b"v0:" + timestamp.encode("utf-8") + b":" + raw_body
    expected = (
        "v0="
        + hmac.new(secret_token.encode("utf-8"), message, hashlib.sha256).hexdigest()
    )
    # Timing-safe comparison to prevent timing attacks
    return hmac.compare_digest(signature, expected)


def build_validation_response(plain_token: str, secret_token: str) -> dict:
    """Build the response body for Zoom's endpoint.url_validation challenge.

    encryptedToken = HMAC-SHA256(plainToken, secretToken) as hex.
    """
    encrypted_token = hmac.new(
        secret_token.encode("utf-8"), plain_token.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return {"plainToken": plain_token, "encryptedToken": encrypted_token}


@app.post("/webhooks/zoom")
async def zoom_webhook(request: Request):
    # Read the raw body for signature verification (do not parse before verifying)
    raw_body = await request.body()
    signature = request.headers.get("x-zm-signature")
    timestamp = request.headers.get("x-zm-request-timestamp")

    # Verify webhook signature
    if not verify_zoom_webhook(raw_body, timestamp, signature, zoom_secret_token):
        return JSONResponse(status_code=401, content={"error": "Invalid signature"})

    # Parse the payload after verification
    payload = json.loads(raw_body)
    event = payload.get("event")

    # Answer the one-time URL validation handshake
    if event == "endpoint.url_validation":
        plain_token = payload["payload"]["plainToken"]
        return build_validation_response(plain_token, zoom_secret_token)

    print(f"Received {event} event")

    # Handle the event based on type
    obj = payload.get("payload", {}).get("object", {})
    if event == "meeting.started":
        print(f"Meeting started: {obj.get('topic')} ({obj.get('id')})")
        # TODO: Start recording bot, notify team, begin tracking, etc.

    elif event == "meeting.ended":
        print(f"Meeting ended: {obj.get('topic')} ({obj.get('id')})")
        # TODO: Trigger follow-ups, compute duration, close sessions, etc.

    elif event == "meeting.participant_joined":
        participant = obj.get("participant", {})
        print(f"Participant joined {obj.get('id')}: {participant.get('user_name')}")
        # TODO: Attendance tracking, greetings, presence updates, etc.

    elif event == "meeting.participant_left":
        participant = obj.get("participant", {})
        print(f"Participant left {obj.get('id')}: {participant.get('user_name')}")
        # TODO: Attendance tracking, drop-off analytics, etc.

    elif event == "recording.completed":
        print(f"Recording completed for meeting {obj.get('id')}")
        # TODO: Download recording, transcribe, publish, notify, etc.

    else:
        print(f"Unhandled event: {event}")

    # Return 200 to acknowledge receipt (within 3 seconds)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
