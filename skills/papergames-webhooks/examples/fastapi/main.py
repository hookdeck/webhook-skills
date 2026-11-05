# Generated with: papergames-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI(title="Papergames Webhook Handler")

# Svix reference libraries default to 5 minutes; Papergames publishes no tolerance. 0 disables the check.
DEFAULT_TOLERANCE_SECONDS = 300


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def decode_secret(secret: str) -> Optional[bytes]:
    """`whsec_<base64>`: base64-decode the part after the prefix.

    A value without the prefix is base64-decoded whole (Standard Webhooks rule).
    Returns None for a secret that is not base64 or decodes to nothing.
    """
    encoded = secret[len("whsec_"):] if secret.startswith("whsec_") else secret
    try:
        key = base64.b64decode(encoded)
    except (binascii.Error, ValueError):
        return None
    return key or None


def read_tolerance() -> int:
    raw = os.environ.get("PAPERGAMES_WEBHOOK_TOLERANCE_SECONDS", "")
    return int(raw) if raw.isdigit() else DEFAULT_TOLERANCE_SECONDS


def verify_signature(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str, key: bytes) -> bool:
    """Papergames is delivered by Svix: HMAC-SHA256 over '{svix-id}.{svix-timestamp}.{raw body}',
    base64-encoded, compared against every 'v1,<base64>' entry in the space-delimited svix-signature header."""
    signed_content = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed_content, hashlib.sha256).digest())
    for entry in signature_header.split(" "):
        version, _, signature = entry.partition(",")
        if version != "v1" or not signature:
            continue  # ignore unknown version tags
        if hmac.compare_digest(signature.encode(), expected):
            return True
    return False


async def verified_body(request: Request) -> tuple[str, bytes]:
    """FastAPI dependency: verifies the Svix signature on the RAW body and returns (svix-id, body)."""
    secret = os.environ.get("PAPERGAMES_WEBHOOK_SECRET")
    key = decode_secret(secret) if secret else None
    if not key:
        print("PAPERGAMES_WEBHOOK_SECRET is missing or not a valid whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    msg_id = request.headers.get("svix-id")
    timestamp = request.headers.get("svix-timestamp")
    signature_header = request.headers.get("svix-signature")
    if not msg_id or not timestamp or not signature_header:
        raise HTTPException(status_code=400, detail="Missing svix-id, svix-timestamp or svix-signature header")

    if not re.fullmatch(r"\d+", timestamp) or int(timestamp) <= 0:
        raise HTTPException(status_code=400, detail="Invalid svix-timestamp header")
    tolerance = read_tolerance()
    if tolerance > 0 and abs(int(time.time()) - int(timestamp)) > tolerance:
        raise HTTPException(status_code=400, detail="Timestamp outside tolerance")

    # The exact bytes Svix signed; never verify re-serialized JSON
    raw_body = await request.body()
    if not verify_signature(raw_body, msg_id, timestamp, signature_header, key):
        raise HTTPException(status_code=400, detail="Invalid signature")
    return msg_id, raw_body


def leaders(players: list) -> list:
    """Winner is not a field: derive it by comparing scores (ties produce several leaders)."""
    if not players:
        return []
    top = max(p.get("score") or 0 for p in players)
    return [p for p in players if (p.get("score") or 0) == top]


def player_label(player: dict) -> str:
    """externalId only appears when you passed externalUserId on the iframe URL; fall back to the name."""
    external_id = player.get("externalId")
    return f"{player.get('name')} ({external_id})" if external_id else str(player.get("name"))


@app.post("/webhooks/papergames")
async def papergames_webhook(verified: tuple[str, bytes] = Depends(verified_body)):
    msg_id, raw_body = verified

    # Parse only after verification: the event type is in the body, not in a header
    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Documented examples put {eventType, payload} at the root; the docs' prose calls the root
    # `webhookPayload`, so tolerate the envelope arriving one level deeper.
    envelope = body["webhookPayload"] if isinstance(body.get("webhookPayload"), dict) else body
    event_type = envelope.get("eventType")
    session = envelope.get("payload") if isinstance(envelope.get("payload"), dict) else {}
    players = [p for p in session.get("players") or [] if isinstance(p, dict)]

    # svix-id is the same on every retry of a message: deduplicate on it. Ordering is not guaranteed,
    # so key game state on session uid + gamesPlayed rather than on arrival order.
    print(f"Received Papergames webhook {msg_id}: {event_type} (session {session.get('uid')})")

    if event_type == "game.started":
        # Fires for each game in the session, so it can arrive several times per uid
        print(f"Game started in session {session.get('uid')}, games played so far: {session.get('gamesPlayed')}")
        print("Players:", ", ".join(player_label(p) for p in players))
    elif event_type == "game.finished":
        # `status` stays "playing" here because a session can hold several games: rely on the event type
        top = leaders(players)
        print(f"Game finished in session {session.get('uid')}, games played: {session.get('gamesPlayed')}")
        print("Leading:", ", ".join(player_label(p) for p in top), "with score", top[0].get("score") if top else 0)
    else:
        # Endpoints subscribe to chosen events and the list may grow: acknowledge anything else
        print(f"Unhandled Papergames event type: {event_type}")

    # Return 2xx quickly; move slow work to a queue
    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
