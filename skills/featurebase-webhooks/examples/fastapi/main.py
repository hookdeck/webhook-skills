# Generated with: featurebase-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


def _as_list(value):
    """A nested JSON array, or [] when the field is missing or another type."""
    return value if isinstance(value, list) else []


load_dotenv()

app = FastAPI()

# Featurebase headers:
#   X-Webhook-Signature  lowercase hex HMAC-SHA256 (64 chars, no prefix)
#   X-Webhook-Timestamp  Unix seconds when Featurebase sent the request
# Signed content: b"{X-Webhook-Timestamp}." + raw body, built as bytes.
# Key: the whole signing secret as UTF-8, including its `whsec_` prefix.
# This is NOT Standard Webhooks: nothing is base64-decoded and there is no id
# header, so the standardwebhooks and svix libraries do not apply.
HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_featurebase_webhook(
    raw_body: bytes,
    signature: str | None,
    timestamp: str | None,
    secret: str | None,
    tolerance_seconds: int = 0,
) -> tuple[bool, str]:
    if not secret or not signature or not timestamp:
        return False, "Missing signature, timestamp or secret"
    # Validate the format before decoding (fullmatch: `$` would allow a trailing newline).
    if not HEX_SHA256.fullmatch(signature):
        return False, "Malformed signature"

    # Header values are encoded latin-1, exactly as received (never trimmed or parsed).
    try:
        timestamp_bytes = timestamp.encode("latin-1")
    except UnicodeEncodeError:
        return False, "Malformed timestamp"
    signed_content = b"".join([timestamp_bytes, b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).digest()
    provided = bytes.fromhex(signature)  # hex is case-insensitive; format already validated
    if not hmac.compare_digest(provided, expected):
        return False, "Signature mismatch"

    # Opt-in only. Hookdeck retries and replays resend the original timestamp.
    if tolerance_seconds > 0:
        if not re.fullmatch(r"[0-9]+", timestamp):
            return False, "Malformed timestamp"
        if abs(time.time() - int(timestamp)) > tolerance_seconds:
            return False, "Timestamp outside tolerance"
    return True, ""


# In-memory dedupe for the demo. Use Redis or your database in production.
# Featurebase retries up to 3 times; the event `id` (notif_...) is the same each time.
processed_event_ids: set[str] = set()


def handle_event(event: dict) -> None:
    topic = event.get("topic")
    data = _as_dict(event.get("data"))
    item = _as_dict(data.get("item"))

    if topic == "post.created":
        print(f"Request created: {item.get('title')} ({item.get('id')})")
    elif topic == "post.updated":
        fields = [str(c.get("field")) for c in _as_list(data.get("changes")) if isinstance(c, dict)]
        print(f"Request updated: {item.get('id')}, changed: {', '.join(fields) or 'n/a'}")
    elif topic == "post.voted":
        voter = _as_dict(item.get("voter"))
        print(f"Request {item.get('postId')} vote {item.get('action')} by {voter.get('name')}")
    elif topic == "ticket.created":
        print(f"Ticket created: #{item.get('ticketNumber')} {item.get('title')}")
    elif topic == "comment.created":
        print(f"Comment created: {item.get('id')} on {item.get('postId') or item.get('changelogId')}")
    elif topic == "changelog.published":
        print(f"Update published: {item.get('title')} ({item.get('locale')})")
    elif topic == "conversation.user.created":
        print(f"Conversation started: {item.get('id')} {item.get('title')}")
    elif topic == "conversation.admin.assigned":
        print(f"Conversation assigned: {item.get('id')}")
    elif topic == "conversation.admin.closed":
        print(f"Conversation closed: {item.get('id')}")
    else:
        # post.deleted, ticket.updated, comment.updated, conversation.* and the rest.
        print(f"Unhandled Featurebase topic: {topic}")


@app.post("/webhooks/featurebase")
async def featurebase_webhook(request: Request):
    secret = os.environ.get("FEATUREBASE_WEBHOOK_SECRET")
    if not secret:
        print("FEATUREBASE_WEBHOOK_SECRET is not set")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Exact bytes as received. Never parse before verifying.
    raw_body = await request.body()
    try:
        tolerance = int(os.environ.get("FEATUREBASE_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0
    valid, error = verify_featurebase_webhook(
        raw_body,
        request.headers.get("x-webhook-signature"),
        request.headers.get("x-webhook-timestamp"),
        secret,
        tolerance,
    )
    if not valid:
        print(f"Featurebase signature verification failed: {error}")
        return JSONResponse({"error": error}, status_code=401)

    try:
        event = json.loads(raw_body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(event, dict):
        return JSONResponse({"error": "Invalid event"}, status_code=400)

    event_id = event.get("id") if isinstance(event.get("id"), str) else None
    if event_id and event_id in processed_event_ids:
        return {"received": True, "duplicate": True}
    if event_id:
        processed_event_ids.add(event_id)

    handle_event(event)
    # Featurebase needs 200/201/202/204 within 5 seconds. Queue slow work.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
