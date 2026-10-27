import base64
import hashlib
import hmac
import json
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Standard padded base64 of a 32-byte digest: 43 characters plus "="
SIGNATURE_FORMAT = re.compile(rb"^[A-Za-z0-9+/]{43}=$")


def verify_onshape_signature(
    raw_body: bytes,
    timestamp: Optional[str],
    signature: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify an Onshape webhook signature.

    Onshape sends X-onshape-webhook-signature-primary =
    base64(HMAC-SHA256(key, "<X-onshape-webhook-timestamp value>.<raw body>")).
    The key is the company's primary signature key, used as a UTF-8 string.
    """
    if not timestamp or not signature or not secret:
        return False
    try:
        received = signature.encode("ascii")
        # Signed message as bytes: header (latin-1) + "." + raw body bytes
        message = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    except UnicodeEncodeError:
        return False

    # Validate the format before comparing: exact length and alphabet
    if not SIGNATURE_FORMAT.match(received):
        return False
    try:
        base64.b64decode(received, validate=True)
    except ValueError:
        return False

    digest = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    return hmac.compare_digest(received, expected)


def is_timestamp_fresh(timestamp: str, tolerance_seconds: float, now: Optional[float] = None) -> bool:
    """Optional replay window. Off unless tolerance_seconds > 0.

    Accepts epoch seconds, epoch milliseconds or an ISO 8601 date string;
    anything unparsable fails.
    """
    if not tolerance_seconds or tolerance_seconds <= 0:
        return True
    now = time.time() if now is None else now
    try:
        if re.fullmatch(r"\d+(\.\d+)?", timestamp):
            n = float(timestamp)
            sent_at = n if n < 1e11 else n / 1000
        else:
            from datetime import datetime

            # Onshape's documented format has a "-0500" style offset
            sent_at = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%S.%f%z").timestamp()
    except ValueError:
        return False
    return abs(now - sent_at) <= tolerance_seconds


def handle_onshape_event(event: dict) -> None:
    """Dispatch a verified Onshape event on the body's `event` field."""
    name = event.get("event")

    if name in ("webhook.register", "webhook.ping", "webhook.unregister"):
        # Sent automatically when a webhook is registered, pinged or removed.
        # Returning 200 is all that is needed.
        print(f"Onshape {name} for webhook {event.get('webhookId')}")
    elif name == "onshape.model.lifecycle.changed":
        print(f"Model changed in document {event.get('documentId')} (element {event.get('elementId')})")
        # TODO: Refresh your copy of the model / re-run exports
    elif name == "onshape.model.translation.complete":
        print(f"Translation {event.get('translationId')} complete in document {event.get('documentId')}")
        # TODO: Download the translated file
    elif name == "onshape.document.lifecycle.created":
        print(f"Document created: {event.get('documentId')}")
        # TODO: Register the document in your system
    elif name == "onshape.document.lifecycle.statechange":
        print(f"Document {event.get('documentId')} state: {event.get('documentState')}")
        # TODO: Archive or remove data when the state is TRASH or DELETED
    elif name == "onshape.revision.created":
        print(f"Revision created in document {event.get('documentId')}")
        # TODO: Sync the release / revision
    elif name == "onshape.comment.create":
        print(f"Comment {event.get('commentId')} created in document {event.get('documentId')}")
        # TODO: Fetch the comment via the REST API and notify
    elif name == "onshape.user.lifecycle.updateappsettings":
        print(f"App settings updated for user {event.get('userId')} (client {event.get('clientId')})")
        # TODO: Re-read the user's app settings
    else:
        print(f"Unhandled Onshape event: {name}")


@app.post("/webhooks/onshape")
async def onshape_webhook(request: Request):
    secret = os.getenv("ONSHAPE_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Only the primary signature is verified; the -secondary header is ignored
    signature = request.headers.get("x-onshape-webhook-signature-primary")
    timestamp = request.headers.get("x-onshape-webhook-timestamp")

    # Raw bytes, whatever the content type - never re-serialize before verifying
    raw_body = await request.body()

    if not verify_onshape_signature(raw_body, timestamp, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        tolerance = float(os.getenv("ONSHAPE_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0
    if not is_timestamp_fresh(timestamp, tolerance):
        raise HTTPException(status_code=401, detail="Timestamp outside tolerance")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Retries resend the same event: de-duplicate on event["messageId"]
    handle_onshape_event(event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
