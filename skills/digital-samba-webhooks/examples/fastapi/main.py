# Generated with: digital-samba-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

BEARER = "bearer "  # auth schemes are case-insensitive (RFC 9110)


def verify_digital_samba_request(headers, secret=None) -> bool:
    """Digital Samba does not sign payloads. When authorization_header is set on the
    webhook, every POST carries "Authorization: Bearer <secret>". The secret is a
    static shared credential: it authenticates the sender, not the body, and gives
    no replay protection.
    """
    secret = secret if secret is not None else os.environ.get("DIGITAL_SAMBA_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    # Tolerate a configured value that already includes "Bearer " (the secret itself is not trimmed).
    expected = secret[7:] if secret[:7].lower() == BEARER else secret
    if not expected:
        return False

    header = headers.get("authorization")
    if not header or header[:7].lower() != BEARER:
        return False

    # Compare bytes: compare_digest raises on non-ASCII str. Header values are decoded
    # as latin-1, so re-encode with latin-1 to recover the original bytes.
    return hmac.compare_digest(header[7:].encode("latin-1"), expected.encode("utf-8"))


async def require_digital_samba_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_digital_samba_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization bearer secret")


def handle_event(payload: dict) -> None:
    event_type = payload.get("eventType")
    session_id = payload.get("sessionId")
    room_id = payload.get("roomId")
    data = payload.get("data") or {}

    if event_type == "participant_joined":
        print(f"Participant joined room {room_id}: {data.get('name')}")
        # TODO: update attendance (data["participantId"], data["role"])

    elif event_type == "participant_left":
        print(f"Participant left room {room_id}")
        # TODO: record the departure

    elif event_type == "session_started":
        print(f"Session started: {session_id}")
        # TODO: mark the room as live

    elif event_type == "session_ended":
        print(f"Session ended: {session_id}")
        # TODO: finalize attendance and billing

    elif event_type == "recording_started":
        print(f"Recording started in session {session_id}")
        # TODO: show a recording indicator

    elif event_type == "recording_stopped":
        print(f"Recording stopped in session {session_id}")
        # TODO: mark the recording as processing

    elif event_type == "recording_ready":
        print(f"Recording ready for session {session_id}")
        # TODO: fetch the recording through the REST API

    elif event_type == "recording_deleted":
        print(f"Recording deleted in session {session_id}")
        # TODO: remove the stored reference

    elif event_type == "session_summary_ready":
        print(f"Session summary ready for session {session_id}")
        # TODO: fetch the summary through the REST API

    elif event_type == "session_transcript_ready":
        print(f"Session transcript ready for session {session_id}")
        # TODO: fetch the transcript through the REST API

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/digital-samba", dependencies=[Depends(require_digital_samba_secret)])
async def digital_samba_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Digital Samba event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
