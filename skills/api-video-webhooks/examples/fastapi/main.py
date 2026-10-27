# Generated with: api-video-webhooks skill
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

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_api_video_signature(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify an api.video webhook signature.

    X-Api-Video-Signature is the bare hex HMAC-SHA256 of the raw request body,
    keyed with the webhook's signatureSecret (used as UTF-8 bytes). Nothing else
    is signed (no timestamp or id).
    """
    if not signature_header or not secret:
        return False
    # Validate format before comparing: exactly 64 hex characters
    if HEX_SHA256.fullmatch(signature_header) is None:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # Hex is case-insensitive; compare as bytes in constant time
    return hmac.compare_digest(signature_header.lower().encode("ascii"), expected.encode("ascii"))


@app.post("/webhooks/api-video")
async def api_video_webhook(request: Request):
    # Raw bytes: the exact body is what api.video signed
    raw_body = await request.body()
    signature = request.headers.get("x-api-video-signature")

    if not verify_api_video_signature(raw_body, signature, os.environ.get("API_VIDEO_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the body's `type` field (X-Api-Video-WebhookID is the subscription id)
    event_type = event.get("type")

    if event_type == "video.source.recorded":
        print(f"Source recorded for video {event.get('videoId')}")
        # TODO: mark upload as received
    elif event_type == "video.encoding.quality.completed":
        print(f"Video {event.get('videoId')} encoded: {event.get('encoding')} {event.get('quality')}")
        # TODO: make the rendition available
    elif event_type == "live-stream.broadcast.started":
        print(f"Live stream {event.get('liveStreamId')} started")
        # TODO: notify viewers
    elif event_type == "live-stream.broadcast.ended":
        print(f"Live stream {event.get('liveStreamId')} ended")
        # TODO: finalize the recording
    elif event_type == "video.caption.generated":
        print(f"Caption generated for video {event.get('videoId')}")
    elif event_type == "video.summary.generated":
        print(f"Summary generated for video {event.get('videoId')}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
