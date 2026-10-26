# Generated with: 100ms-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Demo dedupe store. Use a durable store (Redis, DB unique key) in production.
seen_event_ids: set = set()


def safe_equal(received: str, expected: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str).

    Header values are decoded as latin-1 by Starlette; the configured secret is what
    the user typed (utf-8).
    """
    return hmac.compare_digest(received.encode("latin-1"), expected.encode("utf-8"))


def verify_100ms_request(headers, secret=None, header_name=None) -> bool:
    """100ms does not sign webhooks. You add a secret header in the 100ms dashboard and
    100ms sends it on every request. We compare the WHOLE header value (no 'Bearer '
    parsing or stripping). Header names are looked up lowercase (Starlette lowercases them).
    """
    secret = secret if secret is not None else os.environ.get("HUNDRED_MS_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("HUNDRED_MS_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name.lower())
    return bool(received) and safe_equal(received, secret)


async def require_100ms_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_100ms_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_event(event: dict) -> None:
    event_type = event.get("type")
    data = event.get("data") or {}

    if event_type == "session.open.success":
        print(f"Session opened: {data.get('session_id')} (room {data.get('room_name')})")
        # TODO: mark the session as live

    elif event_type == "session.close.success":
        print(f"Session closed: {data.get('session_id')} after {data.get('session_duration')}s")
        # TODO: record session duration for analytics

    elif event_type == "peer.join.success":
        print(f"Peer joined: {data.get('user_name')} ({data.get('peer_id')}) as {data.get('role')}")
        # TODO: record attendance

    elif event_type == "peer.leave.success":
        print(f"Peer left: {data.get('user_name')} ({data.get('peer_id')})")
        # TODO: close the attendance record

    elif event_type in ("peer.join.failure", "peer.leave.failure", "room.end.failure", "role.change.failure"):
        print(f"Event failed: {event_type}")
        # TODO: alert or investigate (data["error"])

    elif event_type == "room.end.success":
        print(f"Room ended: {data.get('room_id')}")
        # TODO: finalize the room

    elif event_type == "role.change.success":
        print(f"Role changed for peer {data.get('peer_id')}")
        # TODO: update permissions in your app

    elif event_type in (
        "recording.success",
        "track.recording.success",
        "stream.recording.success",
        "beam.recording.success",
        "hls.recording.success",
    ):
        print(f"Recording ready: {event_type}")
        # TODO: fetch the asset from data["location"] or data["recording_path"]

    elif event_type in (
        "recording.failed",
        "track.recording.failure",
        "stream.recording.failure",
        "beam.failure",
        "hls.failure",
    ):
        print(f"Recording or streaming failed: {event_type}")
        # TODO: alert (data["error"])

    elif event_type in (
        "track.recording.started.success",
        "beam.started.success",
        "beam.stopped.success",
        "hls.started.success",
        "hls.stopped.success",
    ):
        print(f"Streaming or recording state changed: {event_type}")
        # TODO: update UI state (data["room_id"], data["session_id"])

    elif event_type in ("transcription.started.success", "transcription.success", "transcription.failure"):
        print(f"Transcription event: {event_type}")
        # TODO: fetch or flag the transcript

    elif event_type in (
        "ingest.start.success",
        "ingest.end.success",
        "ingest.start.failure",
        "ingest.failure",
    ):
        print(f"RTMP ingest event: {event_type}")

    elif event_type in ("sip.start.success", "sip.start.failure", "sip.end.success", "sip.end.failure"):
        print(f"SIP call event: {event_type}")

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/100ms", dependencies=[Depends(require_100ms_secret)])
async def hundred_ms_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(event, dict) or not isinstance(event.get("type"), str):
        raise HTTPException(status_code=400, detail="Expected a JSON object with a type")

    # 100ms retries three times on any non-200, so dedupe on the event id.
    event_id = event.get("id")
    if event_id and event_id in seen_event_ids:
        return {"received": True, "duplicate": True}

    try:
        handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling 100ms event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    if event_id:
        seen_event_ids.add(event_id)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
