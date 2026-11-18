# Generated with: livekit-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import logging
import os

import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# LiveKit's token check allows 10 seconds of clock skew (livekit-server-sdk default)
CLOCK_TOLERANCE_SECONDS = 10


class LiveKitVerificationError(Exception):
    pass


def verify_livekit_webhook(raw_body: bytes, auth_header: str | None, api_key: str, api_secret: str) -> dict:
    """Verify a LiveKit webhook. Raises on failure, returns the JWT claims on success.

    LiveKit sends `Authorization: <JWT>` (bare token, no `Bearer ` prefix). The JWT is
    HS256-signed with the project API secret, `iss` is the API key, and the `sha256` claim
    is base64(SHA-256(raw body)). The JWT signature only covers the claims, so BOTH steps
    are required: verify the token, then compare the body hash.
    """
    if not auth_header:
        raise LiveKitVerificationError("authorization header is empty")
    token = auth_header.strip()
    # Tolerate a `Bearer ` prefix added by a proxy; LiveKit itself sends the bare JWT
    if token[:7].lower() == "bearer ":
        token = token[7:].strip()

    try:
        claims = jwt.decode(
            token,
            key=api_secret,
            algorithms=["HS256"],  # pin the algorithm: never accept `none` or RS256
            issuer=api_key,
            leeway=CLOCK_TOLERANCE_SECONDS,
            options={"require": ["exp", "iss"]},  # a signed token without exp must not verify forever
        )
    except jwt.PyJWTError as exc:
        raise LiveKitVerificationError(f"invalid token: {exc}") from exc

    claimed = claims.get("sha256")
    if not isinstance(claimed, str) or not claimed:
        raise LiveKitVerificationError("sha256 was not found in the token")
    # Standard base64 WITH padding (not base64url, not hex)
    expected = base64.b64encode(hashlib.sha256(raw_body).digest())
    if not hmac.compare_digest(expected, claimed.encode("utf-8", "replace")):
        raise LiveKitVerificationError("sha256 checksum of body does not match")
    return claims


def to_int(value):
    """protojson serialises int64 as a JSON string ("1700000000"); tolerate numbers too."""
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/livekit")
async def livekit_webhook(request: Request):
    api_key = os.getenv("LIVEKIT_API_KEY", "")
    api_secret = os.getenv("LIVEKIT_API_SECRET", "")

    # Fail closed: never skip verification because credentials are missing
    if not api_key or not api_secret:
        logger.error("LIVEKIT_API_KEY / LIVEKIT_API_SECRET not configured; rejecting webhook")
        raise HTTPException(status_code=401, detail="Webhook verification not configured")

    # Read the RAW body (Content-Type is application/webhook+json); never parse and
    # re-serialise before verifying, or the sha256 check fails
    raw_body = await request.body()

    try:
        verify_livekit_webhook(raw_body, request.headers.get("authorization"), api_key, api_secret)
    except LiveKitVerificationError as exc:
        logger.error("LiveKit webhook verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # `id` is the unique event uuid: a retry carries the same id, so dedupe on it.
    # protojson omits zero/default fields, so read everything with .get(). Absent enum
    # fields mean their zero value: track.type AUDIO, track.source UNKNOWN,
    # participant.state JOINING, egressInfo.status EGRESS_STARTING.
    # Don't log the whole payload: room.turnPassword and ingressInfo.streamKey are credentials.
    name = event.get("event")
    room = event.get("room") or {}
    participant = event.get("participant") or {}
    track = event.get("track") or {}
    egress = event.get("egressInfo") or {}
    ingress = event.get("ingressInfo") or {}
    logger.info("Received LiveKit webhook: %s (%s) createdAt=%s", name, event.get("id"), to_int(event.get("createdAt")))

    # Non-zero numDropped = LiveKit's send queue overflowed and events were LOST.
    # Reconcile state via the RoomService API (ListRooms / ListParticipants).
    dropped = to_int(event.get("numDropped")) or 0
    if dropped > 0:
        logger.warning("LiveKit dropped %s webhook event(s) before this one; reconcile state", dropped)

    if name == "room_started":
        logger.info("Room started: %s (%s)", room.get("name"), room.get("sid"))
    elif name == "room_finished":
        logger.info("Room finished: %s (%s)", room.get("name"), room.get("sid"))
    elif name == "participant_joined":
        logger.info("Participant joined %s: %s (%s)", room.get("name"), participant.get("identity"), participant.get("state", "JOINING"))
    elif name == "participant_left":
        logger.info("Participant left %s: %s", room.get("name"), participant.get("identity"))
    elif name == "participant_connection_aborted":
        logger.info("Participant connection aborted in %s: %s", room.get("name"), participant.get("identity"))
    elif name in ("track_published", "track_unpublished"):
        # room and participant are truncated on track events (SID, name, identity only)
        logger.info(
            "%s: %s/%s track %s by %s",
            name, track.get("type", "AUDIO"), track.get("source", "UNKNOWN"), track.get("sid"), participant.get("identity"),
        )
    elif name in ("egress_started", "egress_updated", "egress_ended"):
        logger.info(
            "%s: egress %s for %s is %s",
            name, egress.get("egressId"), egress.get("roomName"), egress.get("status", "EGRESS_STARTING"),
        )
    elif name in ("ingress_started", "ingress_ended"):
        # Never log ingressInfo.streamKey
        logger.info("%s: ingress %s into %s", name, ingress.get("ingressId"), ingress.get("roomName"))
    elif name in ("agent_job_pending", "agent_job_started", "agent_job_ended"):
        # In LiveKit's protocol definition but not its webhooks docs table; payload carries `job`
        logger.info("%s: agent job %s", name, (event.get("job") or {}).get("id"))
    else:
        # Acknowledge unknown events: a 4xx would only burn LiveKit's retries
        logger.info("Unhandled LiveKit event: %s", name)

    return {"received": True}
