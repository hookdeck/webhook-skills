# Generated with: hume-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import re
import time
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse

load_dotenv()

app = FastAPI(title="Hume Webhooks Example")

HEX_DIGEST_RE = re.compile(r"[0-9a-fA-F]{64}")
UNIX_SECONDS_RE = re.compile(r"[0-9]+")


def default_tolerance() -> int:
    """Staleness window in seconds; 0 (the default) disables the check.

    Hume's own example rejects deliveries older than 180 seconds, but Hookdeck
    retries and replays resend the ORIGINAL headers and timestamp (and Hookdeck
    applies no tolerance itself), so a fixed window would reject legitimate
    retries. Set HUME_WEBHOOK_TOLERANCE_SECONDS to opt in. Read at call time so
    it can be changed without a restart in tests.
    """
    try:
        return int(os.environ.get("HUME_WEBHOOK_TOLERANCE_SECONDS", "0") or "0")
    except ValueError:
        return 0


def verify_hume_signature(
    raw_body: bytes,
    signature_header: str | None,
    timestamp_header: str | None,
    secret: str | None,
    tolerance_seconds: int | None = None,
) -> bool:
    """Verify a Hume EVI webhook signature.

    Hume sends ``X-Hume-AI-Webhook-Signature: <hex>`` (bare digest, no prefix)
    and ``X-Hume-AI-Webhook-Timestamp: <unix seconds>``. The digest is
    HMAC-SHA256(signing key, "<raw body>.<timestamp>"). The message is built as
    BYTES: the raw body bytes untouched, a literal ".", then the timestamp
    header exactly as received (latin-1).

    ``raw_body`` must be the RAW request bytes, never re-serialized JSON.
    """
    if not secret or not signature_header or not timestamp_header:
        return False
    if tolerance_seconds is None:
        tolerance_seconds = default_tolerance()

    # The whole header is one bare hex digest. Validate the format BEFORE decoding
    if not HEX_DIGEST_RE.fullmatch(signature_header):
        return False

    # Optional staleness check (not enabled by default, see above)
    if tolerance_seconds > 0:
        if not UNIX_SECONDS_RE.fullmatch(timestamp_header):
            return False
        if abs(time.time() - int(timestamp_header)) > tolerance_seconds:
            return False

    try:
        timestamp_bytes = timestamp_header.encode("latin-1")
    except UnicodeEncodeError:
        return False
    # Body FIRST, then a period, then the timestamp
    signed_content = b"".join([raw_body, b".", timestamp_bytes])
    expected = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).digest()

    # Hex is case-insensitive, so decode to bytes and compare in constant time
    return hmac.compare_digest(bytes.fromhex(signature_header), expected)


def handle_hume_event(event: dict[str, Any]) -> str:
    """Dispatch a verified Hume EVI event on ``event_name``.

    Documented events: chat_started, chat_ended, tool_call. Anything else is
    logged and acknowledged.

    Returns what was handled, e.g. "chat_ended" or "unhandled:<name>".
    """
    event_name = event.get("event_name")
    tool_call = event.get("tool_call_message")
    tool_call = tool_call if isinstance(tool_call, dict) else {}

    if event_name == "chat_started":
        print(f"Chat {event.get('chat_id')} started ({event.get('chat_start_type')})")
        # TODO: start a logging session, update a dashboard, notify a team
        return "chat_started"

    if event_name == "chat_ended":
        print(
            f"Chat {event.get('chat_id')} ended after "
            f"{event.get('duration_seconds')}s ({event.get('end_reason')})"
        )
        # TODO: save session data, process the transcript, track end_reason
        return "chat_ended"

    if event_name == "tool_call":
        print(
            f"Chat {event.get('chat_id')} tool call: {tool_call.get('name')} "
            f"(response_required={tool_call.get('response_required')})"
        )
        # TODO: run the tool server-side, then reply via the EVI Control Plane API
        return "tool_call"

    print(f"Unhandled Hume event: {event_name}")
    return f"unhandled:{event_name}"


async def verified_body(request: Request) -> bytes:
    """FastAPI dependency: read the raw bytes and verify them before any parsing."""
    # CRITICAL: request.body() is the exact bytes Hume signed
    raw_body = await request.body()

    if not verify_hume_signature(
        raw_body,
        request.headers.get("x-hume-ai-webhook-signature"),
        request.headers.get("x-hume-ai-webhook-timestamp"),
        os.environ.get("HUME_WEBHOOK_SECRET"),
    ):
        print("Hume signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    return raw_body


@app.post("/webhooks/hume", response_class=PlainTextResponse)
async def hume_webhook(raw_body: bytes = Depends(verified_body)) -> str:
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    handle_hume_event(event)
    return "OK"


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
