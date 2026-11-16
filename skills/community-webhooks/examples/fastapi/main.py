# Generated with: community-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import time
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse

load_dotenv()

app = FastAPI(title="Community Webhooks Example")

# Community's docs specify NO tolerance window for the signature timestamp, so
# the staleness check is OFF by default. Enabling it is your own hardening
# choice — keep any window well above an hour, since Community retries a failed
# delivery for up to an hour from the first attempt.
TOLERANCE_SECONDS = int(os.environ.get("COMMUNITY_WEBHOOK_TOLERANCE_SECONDS", "0"))

# Deduplication store — Community delivers AT-LEAST-ONCE and documents that the
# same event can arrive more than once. Keep event ids for at least an hour.
# Replace with Redis/Postgres in production.
DEDUPE_TTL_SECONDS = 60 * 60
_seen_events: dict[str, float] = {}


def parse_signature_header(header: str) -> tuple[str, str] | None:
    """Parse a ``community-signature`` header of the form ``t=<unix>,v1=<hex>``.

    Splits on ``,`` then on the first ``=`` so field order does not matter. Only
    the ``v1`` scheme is defined; any other version is treated as unsupported.
    """
    fields: dict[str, str] = {}
    for part in header.split(","):
        key, sep, value = part.partition("=")
        if sep:
            fields[key.strip()] = value.strip()

    timestamp = fields.get("t")
    signature = fields.get("v1")
    if not timestamp or not signature:
        return None

    return timestamp, signature


def verify_community_signature(
    raw_body: bytes,
    signature_header: str | None,
    secret: str | None,
    tolerance_seconds: int = TOLERANCE_SECONDS,
) -> bool:
    """Verify a Community webhook signature.

    Community signs ``{timestamp}.{raw_body}`` with HMAC-SHA256 using the
    webhook's signature secret and sends the result as
    ``community-signature: t=<unix_seconds>,v1=<lowercase_hex>``.

    ``raw_body`` must be the RAW request bytes, never re-serialized JSON.
    """
    if not signature_header or not secret:
        return False

    parsed = parse_signature_header(signature_header)
    if parsed is None:
        return False

    timestamp, signature = parsed

    # Optional staleness check (not a documented Community requirement)
    if tolerance_seconds > 0:
        try:
            ts = int(timestamp)
        except ValueError:
            return False
        if abs(int(time.time()) - ts) > tolerance_seconds:
            return False

    # Signed content is the timestamp, a literal ".", then the RAW body
    signed_content = timestamp.encode("utf-8") + b"." + raw_body
    expected = hmac.new(
        secret.encode("utf-8"), signed_content, hashlib.sha256
    ).hexdigest()

    # Constant-time comparison. Hex is case-insensitive (0xAB === 0xab), so both
    # sides are normalized and a valid uppercase digest is accepted rather than rejected. `expected` is
    # already lowercase — hexdigest() emits lowercase.
    return hmac.compare_digest(expected, signature.lower())


async def verified_event(request: Request) -> dict[str, Any]:
    """FastAPI dependency: verify the signature, then parse the event.

    Reads the raw body first — Community signs the raw bytes, so parsing JSON
    before verifying would change them and break the signature.
    """
    raw_body = await request.body()
    signature_header = request.headers.get("community-signature")

    if not signature_header:
        raise HTTPException(status_code=400, detail="Missing community-signature header")

    if not verify_community_signature(
        raw_body,
        signature_header,
        os.environ.get("COMMUNITY_WEBHOOK_SECRET"),
    ):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    return event


def extract_object(event: dict[str, Any]) -> dict[str, Any]:
    """Extract the event payload from a Community envelope.

    Every documented sample nests it at ``data.object``, while the prose on the
    same page describes ``data.member`` / ``data.message``. Prefer the samples,
    fall back defensively.
    """
    data = event.get("data") or {}
    if not isinstance(data, dict):
        return {}

    for key in ("object", "member", "message"):
        value = data.get(key)
        if isinstance(value, dict):
            return value

    return {}


def already_processed(event_id: str) -> bool:
    """Track event ids for an hour so duplicate deliveries are not reprocessed."""
    now = time.time()
    for seen_id, seen_at in list(_seen_events.items()):
        if now - seen_at > DEDUPE_TTL_SECONDS:
            del _seen_events[seen_id]

    if event_id in _seen_events:
        return True

    _seen_events[event_id] = now
    return False


@app.post("/webhooks/community")
async def community_webhook(event: dict[str, Any] = Depends(verified_event)):
    event_id = event.get("id")
    event_type = event.get("type")

    # Deduplicate before doing any work — messages especially should be handled
    # at-most-once (better to not send than to send twice).
    if isinstance(event_id, str) and already_processed(event_id):
        print(f"Duplicate event {event_id} ignored")
        return PlainTextResponse("OK", status_code=200)

    obj = extract_object(event)

    if event_type == "message.inbound":
        member = obj.get("member") or {}
        channel_id = member.get("communication_channel_id") if isinstance(member, dict) else None
        print(f"Inbound message {obj.get('id')} from {channel_id}: {obj.get('text')}")
        # TODO: route to support inbox, run keyword automations

    elif event_type == "message.outbound":
        # The sample shows "automated" while the documented list is capitalized,
        # so compare case-insensitively.
        kind = str(obj.get("outbound_message_type") or "").lower()
        print(f"Outbound message {obj.get('id')} (type: {kind})")
        # TODO: log conversation history, attribute campaign sends

    elif event_type == "member.created":
        print(f"Member created: {obj.get('id')}")
        # TODO: welcome flow, create the contact in your CRM

    elif event_type == "member.updated":
        print(f"Member updated: {obj.get('id')} (active: {obj.get('active')})")
        # TODO: sync profile changes downstream

    elif event_type == "member.deleted":
        # Sparse payload: only id, active, timestamp, client_id,
        # communication_channel, and an emptied communication_channel_id.
        print(f"Member deleted: {obj.get('id')}")
        # TODO: suppression list, downstream deletion

    else:
        print(f"Unhandled Community event type: {event_type}")

    # Community requires a 2xx within 15 seconds — acknowledge fast and do the
    # real work asynchronously.
    return PlainTextResponse("OK", status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
