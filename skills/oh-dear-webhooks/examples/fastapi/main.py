# Generated with: oh-dear-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


def _as_str(value):
    """A JSON string field, or "" when the field is missing or another type."""
    return value if isinstance(value, str) else ""


load_dotenv()

app = FastAPI()

_SIGNATURE_RE = re.compile(r"[0-9a-fA-F]{64}")
_UPTIME_FAILED_RE = re.compile(r"(http|tcp|ping)UptimeCheckFailedNotification")
_UPTIME_RECOVERED_RE = re.compile(r"(http|tcp|ping)UptimeCheckRecoveredNotification")


def verify_oh_dear_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    """Verify the OhDear-Signature header.

    The header is the bare lowercase hex HMAC-SHA256 of the raw request body,
    keyed with the team signing secret (used as UTF-8 bytes).
    """
    # Validate format first (exact length and alphabet) before decoding
    if not signature_header or not _SIGNATURE_RE.fullmatch(signature_header):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    # Compare bytes, not str
    return hmac.compare_digest(bytes.fromhex(signature_header), expected)


async def verified_event(request: Request) -> dict:
    """Dependency: read the raw body, verify the signature, then parse the JSON."""
    secret = os.environ.get("OH_DEAR_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body = await request.body()  # exact bytes as received
    if not verify_oh_dear_signature(raw_body, request.headers.get("ohdear-signature"), secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after the signature check
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")
    return event


@app.post("/webhooks/oh-dear")
async def oh_dear_webhook(event: dict = Depends(verified_event)):
    # Dispatch on the top-level `type` (nested objects have their own `type` keys).
    # `uuid` is stable across retries and manual resends: use it to deduplicate.
    event_type = _as_str(event.get("type"))
    print(f"Received {event_type} (uuid: {event.get('uuid')})")

    if event_type == "monitorAddedNotification":
        print(f"Monitor added: {_as_dict(event.get('monitor')).get('url')}")
    elif _UPTIME_FAILED_RE.fullmatch(event_type):
        print(f"Uptime check failed: {event.get('result_url')}")
    elif _UPTIME_RECOVERED_RE.fullmatch(event_type):
        print(f"Uptime check recovered: {event.get('result_url')}")
    elif event_type == "certificateExpiresSoonNotification":
        print("Certificate expires soon")
    elif event_type == "brokenLinksFoundNotification":
        print("Broken links found")
    elif event_type == "cronFailedNotification":
        print("Scheduled task failed")
    else:
        print(f"Unhandled event type: {event_type}")

    # Oh Dear only treats HTTP 200 as success (redirects fail)
    return {"received": True}
