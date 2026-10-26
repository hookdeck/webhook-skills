# Generated with: cloudsmith-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()

HEX_SHA1 = re.compile(r"[0-9a-fA-F]{40}")


def verify_cloudsmith_webhook(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    """Verify a Cloudsmith webhook signature.

    Cloudsmith sends the bare hex HMAC-SHA1 of the raw body (key = the webhook's
    HMAC Signature Key, UTF-8) in the X-Cloudsmith-Signature header.
    """
    if not signature or not secret or not HEX_SHA1.fullmatch(signature):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).digest()
    # The format was checked above, so decoding cannot fail or drop characters
    received = bytes.fromhex(signature)

    # Timing-safe comparison on bytes
    return hmac.compare_digest(received, expected)


def handle_event(item: dict) -> None:
    # Every field of the body is untrusted: check types before reading into it
    meta = item.get("meta") if isinstance(item.get("meta"), dict) else {}
    data = item.get("data") if isinstance(item.get("data"), dict) else {}
    event_id = meta.get("event_id") if isinstance(meta.get("event_id"), str) else None
    pkg = "/".join(
        part for part in (data.get("namespace"), data.get("repository"), data.get("name"))
        if isinstance(part, str)
    )
    print(f"Received {event_id or 'unknown event'} (trigger {meta.get('trigger_id', 'n/a')})")

    if event_id == "ping":
        print("Cloudsmith ping received")
    elif event_id == "package.created":
        print(f"Package created: {pkg}")
        # TODO: Record the new upload
    elif event_id in ("package.syncing", "package.synced"):
        print(f"{event_id}: {pkg} ({data.get('stage_str', 'unknown stage')})")
        # TODO: package.synced means the package is ready to download
    elif event_id == "package.security_scanned":
        print(f"Security scan finished: {pkg}")
        # TODO: Fetch the scan results from the Cloudsmith API
    elif event_id == "package.quarantined":
        print(f"Package quarantined: {pkg}")
        # TODO: Alert the owning team
    elif event_id == "package.failed":
        print(f"Package failed: {pkg}")
    elif event_id in ("package.released", "package.restored", "package.tags_updated", "package.deleted"):
        print(f"{event_id}: {pkg}")
    else:
        print(f"Unhandled event: {event_id}")


@app.post("/webhooks/cloudsmith")
async def cloudsmith_webhook(
    request: Request,
    x_cloudsmith_signature: str | None = Header(default=None),
):
    # Read the raw bytes before parsing - the signature covers exactly these bytes
    raw_body = await request.body()

    # Read the secret per request so it can be rotated without a restart
    if not verify_cloudsmith_webhook(
        raw_body, x_cloudsmith_signature, os.environ.get("CLOUDSMITH_WEBHOOK_SECRET")
    ):
        print("Cloudsmith webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload only after verification
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Default "JSON Object" format is one event; "JSON Array" wraps it in [...]
    items = payload if isinstance(payload, list) else [payload]
    if not all(isinstance(item, dict) for item in items):
        raise HTTPException(status_code=400, detail="Unexpected payload shape")
    for item in items:
        handle_event(item)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
