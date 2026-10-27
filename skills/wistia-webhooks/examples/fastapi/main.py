# Generated with: wistia-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

# X-Wistia-Signature is the bare hex HMAC-SHA256 of the raw body: exactly 64 hex characters
HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_wistia_signature(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    """Verify X-Wistia-Signature: lowercase hex HMAC-SHA256 of the raw body, keyed with the secret."""
    if not secret or not signature or not HEX_SHA256.fullmatch(signature):
        return False

    # Key = the secret's UTF-8 bytes; message = the raw body bytes, untouched
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    received = bytes.fromhex(signature)  # safe: format validated above
    return hmac.compare_digest(received, expected)


# Wistia delivers at least once, so remember event uuids we've handled.
# In production use a database or Redis with a TTL instead of process memory.
seen_event_uuids: set[str] = set()


def handle_event(event: dict) -> None:
    event_type = event.get("type")
    payload = _as_dict(event.get("payload"))
    media_id = _as_dict(payload.get("media")).get("id")

    if event_type == "media.created":
        print("Media created:", media_id)
        # TODO: Record the media as uploaded
    elif event_type == "media.processing":
        print("Media processing:", media_id)
    elif event_type == "media.ready":
        print("Media ready:", media_id)
        # TODO: Publish the video; it is ready for playback
    elif event_type == "media.failed":
        print("Media failed:", media_id)
        # TODO: Mark the media as failed and notify the uploader
    elif event_type == "media.updated":
        print("Media updated:", media_id, payload.get("previous_attributes"))
    elif event_type == "media.transcript_updated":
        print("Transcript updated:", media_id, _as_dict(payload.get("transcript")).get("language_code"))
    elif event_type == "media.transcript_failed":
        print("Transcript failed:", media_id, _as_dict(payload.get("transcript")).get("reason"))
    elif event_type == "media.deleted":
        print("Media deleted:", media_id)
        # TODO: Remove the media from your catalog
    elif event_type == "media.translation_created":
        print("Translation created:", media_id)
    elif event_type == "media.localization_created":
        print("Localization created:", _as_dict(payload.get("localization")).get("hashed_id"))
    elif event_type == "media.localization_failed":
        print("Localization failed:", _as_dict(payload.get("localization")).get("hashed_id"))
    elif event_type == "viewing_session.play":
        print("Play:", _as_dict(payload.get("viewing_session")).get("id"), media_id)
    elif event_type == "viewing_session.percent_watched":
        print("Percent watched:", payload.get("percent_watched"), media_id)
    elif event_type == "viewing_session.turnstile.converted":
        print("Form converted:", _as_dict(payload.get("viewing_session")).get("id"))
        # TODO: Send the lead to your CRM
    elif event_type == "viewing_session.call_to_action.converted":
        print("Call to action converted:", _as_dict(payload.get("viewing_session")).get("id"))
    elif event_type == "viewing_session.annotation.converted":
        print("Annotation converted:", _as_dict(payload.get("viewing_session")).get("id"))
    elif event_type == "live_event.registration":
        print("Live event registration:", _as_dict(payload.get("live_event")).get("id"))
        # TODO: Add the registrant to your system
    else:
        print(f"Unhandled event type: {event_type}")


@app.post("/webhooks/wistia")
async def wistia_webhook(request: Request):
    # Raw bytes, exactly as received - never parse before verifying
    raw_body = await request.body()

    if not verify_wistia_signature(
        raw_body,
        request.headers.get("x-wistia-signature"),
        os.getenv("WISTIA_WEBHOOK_SECRET"),
    ):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after the signature check
    try:
        body = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(body, dict) or not isinstance(body.get("events"), list):
        raise HTTPException(status_code=400, detail="Missing events array")

    # One POST can batch several events; each has its own uuid
    for event in body["events"]:
        if not isinstance(event, dict):
            continue
        uuid = event.get("uuid")
        if isinstance(uuid, str):
            if uuid in seen_event_uuids:
                continue
            seen_event_uuids.add(uuid)
        handle_event(event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
