# Generated with: stream-webhooks skill
# https://github.com/hookdeck/webhook-skills
import gzip
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

GZIP_MAGIC = b"\x1f\x8b"


def decode_body(raw_body: bytes) -> bytes:
    """
    Stream signs the UNCOMPRESSED body. If Payload Compression
    (enable_hook_payload_compression) is on, gunzip before verifying.
    Turn compression off when using Hookdeck.
    """
    if raw_body[:2] == GZIP_MAGIC:
        return gzip.decompress(raw_body)
    return raw_body


def verify_stream_webhook(raw_body: bytes, signature: str | None, api_secret: str | None) -> bool:
    """Verify a Stream webhook: hex HMAC-SHA256 of the raw body, keyed with the app API secret."""
    if not signature or not api_secret:
        return False

    expected = hmac.new(api_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature.encode(), expected.encode())


@app.post("/webhooks/stream")
async def stream_webhook(request: Request):
    # Read the raw bytes (not request.json()) so the signature can be verified
    raw_body = await request.body()
    signature = request.headers.get("x-signature")
    webhook_id = request.headers.get("x-webhook-id")
    api_key = request.headers.get("x-api-key")

    try:
        body = decode_body(raw_body)
    except (OSError, EOFError):
        raise HTTPException(status_code=400, detail="Invalid body encoding")

    if not verify_stream_webhook(body, signature, os.environ.get("STREAM_API_SECRET")):
        print("Stream webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Optional sanity check that the call is for your app
    expected_key = os.environ.get("STREAM_API_KEY")
    if expected_key and api_key != expected_key:
        raise HTTPException(status_code=400, detail="Unexpected API key")

    # Parse only after verification
    try:
        event = json.loads(body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("type")
    # X-Webhook-Id is stable across retries: use it to dedupe
    print(f"Received {event_type} (webhook id: {webhook_id})")

    if event_type == "message.new":
        print(f"New message in {event.get('cid')}: {(event.get('message') or {}).get('text')}")
    elif event_type == "message.updated":
        print(f"Message updated: {(event.get('message') or {}).get('id')}")
    elif event_type == "message.deleted":
        print(f"Message deleted: {(event.get('message') or {}).get('id')}")
    elif event_type == "reaction.new":
        print(f"Reaction {(event.get('reaction') or {}).get('type')} on {(event.get('message') or {}).get('id')}")
    elif event_type == "channel.created":
        print(f"Channel created: {event.get('cid')}")
    elif event_type == "user.updated":
        print(f"User updated: {(event.get('user') or {}).get('id')}")
    elif event_type == "member.added":
        print(f"Member added: {(event.get('member') or {}).get('user_id')} to {event.get('cid')}")
    else:
        # Stream adds event types over time; don't fail on unknown ones
        print(f"Unhandled event type: {event_type}")

    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
