# Generated with: heygen-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_heygen_signature(raw_body: bytes, signature: str | None, secret: str) -> bool:
    """Verify HeyGen's `signature` header: hex HMAC-SHA256 of the raw body.

    The key is the whole endpoint secret (including "whsec_") as UTF-8 bytes.
    This is NOT Standard Webhooks: no svix/standardwebhooks, no base64 decoding.
    """
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())


@app.post("/webhooks/heygen")
async def heygen_webhook(request: Request):
    # Raw bytes, read before any JSON parsing
    raw_body = await request.body()

    signature = request.headers.get("signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing signature header")

    if not verify_heygen_signature(raw_body, signature, os.getenv("HEYGEN_WEBHOOK_SECRET", "")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("event_type")
    data = event.get("event_data") or {}

    # Retries resend the same payload: dedupe on event_data.video_id + event_type
    if event_type == "avatar_video.success":
        print(f"Avatar video ready: {data.get('video_id')} {data.get('url')}")
        # TODO: Download the file (the URL is pre-signed and expires) and notify the user
    elif event_type == "avatar_video.fail":
        print(f"Avatar video failed: {data.get('video_id')}")
        # TODO: Mark the video as failed and alert the user
    elif event_type == "video_translate.success":
        print(f"Video translation complete: {data}")
        # TODO: GET /v3/video-translations/{id} and store the translated video
    elif event_type == "video_translate.fail":
        print(f"Video translation failed: {data}")
        # TODO: Mark the translation as failed
    else:
        print(f"Unhandled event type: {event_type}")

    # Return 2xx within 10 seconds to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
