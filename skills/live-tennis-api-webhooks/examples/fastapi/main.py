# Generated with: live-tennis-api-webhooks skill
# https://github.com/hookdeck/webhook-skills

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Live Tennis API's receiver check: reject a `t` more than 5 minutes from your clock.
TOLERANCE_SECONDS = 300


def verify_live_tennis_signature(raw_body: bytes, header: str, secret: str, now: int | None = None) -> int | None:
    """Verify X-LTAPI-Signature-V1: "t=<unix seconds>,v1=<hex>".

    Each v1 is the hex HMAC-SHA256, keyed with the webhook secret, of "<t>.<raw request body>".
    Accept if any v1 matches. Returns the verified timestamp, or None.
    Never fall back to the deprecated X-LTAPI-Signature: it doesn't cover the timestamp.
    """
    timestamp = None
    signatures = []
    for part in header.split(","):
        key, sep, value = part.strip().partition("=")
        if not sep:
            continue
        if key == "t":
            timestamp = value
        elif key == "v1":
            signatures.append(value.lower())

    if not timestamp or not re.fullmatch(r"[0-9]+", timestamp) or not signatures:
        return None
    now = int(time.time()) if now is None else now
    if abs(now - int(timestamp)) > TOLERANCE_SECONDS:
        return None

    expected = hmac.new(secret.encode("utf-8"), timestamp.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    # Compare bytes: compare_digest raises TypeError on non-ASCII str, which would be a 500.
    if any(hmac.compare_digest(sig.encode("utf-8"), expected.encode()) for sig in signatures):
        return int(timestamp)
    return None


# Seen delivery_ids, kept until t + 5 minutes. With several workers, use a shared
# store with an atomic insert-if-absent (for example Redis SET NX EX) instead.
seen_deliveries: dict[str, int] = {}


def first_delivery(delivery_id: str, timestamp: int) -> bool:
    now = int(time.time())
    for key in [k for k, expires_at in seen_deliveries.items() if expires_at < now]:
        del seen_deliveries[key]
    if delivery_id in seen_deliveries:
        return False
    seen_deliveries[delivery_id] = timestamp + TOLERANCE_SECONDS
    return True


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/live-tennis-api")
async def live_tennis_api_webhook(request: Request):
    secret = os.getenv("LIVE_TENNIS_API_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Server configuration error")

    signature = request.headers.get("x-ltapi-signature-v1")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-LTAPI-Signature-V1 header")

    # IMPORTANT: use the raw bytes, whatever the Content-Type; don't parse JSON first
    raw_body = await request.body()

    timestamp = verify_live_tennis_signature(raw_body, signature, secret)
    if timestamp is None:
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification
    try:
        frame = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    if not isinstance(frame, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # delivery_id is unique per delivery and inside the signed body
    delivery_id = frame.get("delivery_id")
    if delivery_id and not first_delivery(str(delivery_id), timestamp):
        return {"received": True, "duplicate": True}

    # The signed body carries the frame type; X-LTAPI-Event (unsigned) is the fallback.
    event = frame.get("type") or request.headers.get("x-ltapi-event")
    print(f"Received Live Tennis API frame: {event} (match {frame.get('match_id')})")

    if event == "score":
        # The complete current score: apply it if its `sequence` is newer than the one you hold
        print("Score:", frame.get("match_id"), frame.get("sequence"))
    elif event == "score_withdrawn":
        # Discard the state with this sequence and resume from the next score frame
        print("Score withdrawn:", frame.get("match_id"), frame.get("superseded_sequence"), frame.get("kind"))
    elif event == "point":
        # Store keyed on (match_id, point.seq); fill gaps from GET /matches/{id}/points?after_seq=
        point = frame.get("point") or {}
        print("Point:", frame.get("match_id"), point.get("seq"))
    elif event == "break_point":
        print("Break point:", frame.get("match_id"), "server", frame.get("server"), "returner", frame.get("returner"))
    elif event == "break_point_result":
        # outcome is "held" or "broken"
        print("Break point result:", frame.get("match_id"), frame.get("outcome"))
    elif event == "status":
        print("Status change:", frame.get("match_id"))
    else:
        print("Unhandled Live Tennis API event:", event)

    return {"received": True, "event": event}
