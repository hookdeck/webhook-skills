# Generated with: mux-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Mux SDKs reject signatures older than 5 minutes
SIGNATURE_TOLERANCE_SECONDS = 300


def verify_mux_signature(
    raw_body: bytes,
    header: str | None,
    secret: str,
    tolerance: int = SIGNATURE_TOLERANCE_SECONDS,
) -> bool:
    """Verify a mux-signature header: t=<unix seconds>,v1=<hex HMAC-SHA256>.

    The Mux Python SDK has no webhook helper, so verify manually.
    """
    if not header or not secret:
        return False

    timestamp = None
    signatures = []
    for part in header.split(","):
        key, _, value = part.strip().partition("=")
        if key == "t":
            timestamp = value
        elif key == "v1":
            signatures.append(value)

    if not timestamp or not timestamp.isdigit() or not signatures:
        return False

    # Reject stale (or far-future) timestamps to limit replay attacks
    if abs(time.time() - int(timestamp)) > tolerance:
        return False

    # Signed payload is "<timestamp>.<raw body>"
    signed_payload = timestamp.encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()

    # Timing-safe comparison against every v1 signature in the header
    return any(hmac.compare_digest(expected, sig) for sig in signatures)


@app.post("/webhooks/mux")
async def mux_webhook(request: Request):
    # Get the raw body for signature verification
    payload = await request.body()
    signature_header = request.headers.get("mux-signature")

    if not signature_header:
        raise HTTPException(status_code=400, detail="Missing mux-signature header")

    if not verify_mux_signature(payload, signature_header, os.environ.get("MUX_WEBHOOK_SECRET", "")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Handle the event based on type
    event_type = event.get("type")
    data = event.get("data") or {}

    if event_type == "video.asset.created":
        print(f"Asset created: {data.get('id')}")
        # TODO: Record the asset and show it as processing

    elif event_type == "video.asset.ready":
        print(f"Asset ready: {data.get('id')} {data.get('playback_ids')}")
        # TODO: Store the playback ID and publish the video

    elif event_type == "video.asset.errored":
        print(f"Asset errored: {data.get('id')} {data.get('errors')}")
        # TODO: Mark the asset as failed and notify the uploader

    elif event_type == "video.asset.deleted":
        print(f"Asset deleted: {data.get('id')}")
        # TODO: Remove the asset from your catalog

    elif event_type == "video.asset.live_stream_completed":
        print(f"Live stream asset completed: {data.get('id')}")
        # TODO: Publish the recorded replay

    elif event_type == "video.upload.asset_created":
        print(f"Upload created asset: {data.get('id')} {data.get('asset_id')}")
        # TODO: Link the new asset to the user who uploaded it

    elif event_type == "video.live_stream.active":
        print(f"Live stream active: {data.get('id')}")
        # TODO: Show the stream as live

    elif event_type == "video.live_stream.idle":
        print(f"Live stream idle: {data.get('id')}")
        # TODO: Show the stream as ended

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
