# Generated with: vimeo-webhooks skill
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

HEX_SHA256 = re.compile(r"[0-9a-f]{64}", re.IGNORECASE)


def verify_vimeo(raw_body: bytes, signature: str | None, secret: str) -> bool:
    """Verify a Vimeo webhook signature.

    Vimeo has no webhook SDK, so we verify manually. When the webhook has a
    `secret`, Vimeo sends `X-Webhook-Signature` = lowercase hex HMAC-SHA256 of
    the RAW request body keyed with that secret. Nothing else is signed.
    """
    if not secret or not signature or not HEX_SHA256.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Encode both sides to bytes: compare_digest on str raises TypeError for
    # non-ASCII input, which would turn a junk header into a 500.
    return hmac.compare_digest(expected.encode("utf-8"), signature.lower().encode("utf-8"))


@app.post("/webhooks/vimeo")
async def vimeo_webhook(request: Request):
    webhook_secret = os.environ.get("VIMEO_WEBHOOK_SECRET", "")
    if not webhook_secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Read the RAW body for signature verification (do not parse JSON first).
    raw_body = await request.body()

    signature = request.headers.get("x-webhook-signature")
    if not signature:
        # Vimeo only signs webhooks that have a `secret` set via the API.
        raise HTTPException(status_code=401, detail="Missing X-Webhook-Signature header")

    if not verify_vimeo(raw_body, signature, webhook_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Signature verified - safe to parse.
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the `webhook_type` field in the body.
    # Vimeo sends no delivery ID: dedupe on webhook_type + data URI + timestamp.
    webhook_type = event.get("webhook_type") if isinstance(event, dict) else None
    data = event.get("data") or {} if isinstance(event, dict) else {}

    if webhook_type == "video-created":
        print(f"Video created: {data.get('video_uri')}")
        # TODO: record the new video

    elif webhook_type == "video-deleted":
        print(f"Video deleted: {data.get('video_uri')}")
        # TODO: remove the video from your catalog

    elif webhook_type == "video-transcode-playable":
        print(f"Video playable: {data.get('video_uri')}")
        # TODO: allow playback

    elif webhook_type == "video-transcode-complete":
        print(f"Video transcode complete: {data.get('video_uri')} ({data.get('version_uri')})")
        # TODO: mark processing done

    elif webhook_type == "video-upload-failed":
        print(f"Video upload failed: {data.get('video_uri')} ({data.get('error_type')})")
        # TODO: notify the uploader

    elif webhook_type == "transcript-status-complete":
        print(f"Transcript {data.get('transcript_status')}: {data.get('video_uri')}")
        # TODO: fetch the transcript if completed

    elif webhook_type == "live-event-started":
        print(f"Live event started: {data.get('event_uri')}")
        # TODO: notify viewers

    elif webhook_type == "live-event-ended":
        print(f"Live event ended: {data.get('event_uri')}")
        # TODO: close out the stream

    else:
        print(f"Unhandled event type: {webhook_type}")

    # Return 200 quickly to acknowledge receipt.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
