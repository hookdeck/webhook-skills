# Generated with: hostaway-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Hostaway's docs don't name the HTTP method, so accept all the usual ones.
ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

_BASIC_RE = re.compile(r"^basic +(\S+)$", re.IGNORECASE)


def safe_equal(a: str, b: str) -> bool:
    """Constant-time compare on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def parse_basic_auth(header):
    """Parse 'Authorization: Basic base64(username:password)'.

    The scheme is case-insensitive, the base64 is decoded strictly (validate=True) so valid
    credentials followed by junk are rejected, and the split is on the first colon so the
    password may contain colons. Returns None when malformed.
    """
    if not isinstance(header, str):
        return None
    match = _BASIC_RE.match(header.strip())
    if not match:
        return None
    try:
        text = base64.b64decode(match.group(1), validate=True).decode("utf-8")
    except (binascii.Error, ValueError):
        return None
    username, sep, password = text.partition(":")
    if not sep:
        return None
    return username, password


def verify_hostaway_request(headers, username=None, password=None) -> bool:
    """Hostaway does not sign payloads. If you set a login and password on the webhook,
    Hostaway sends them as HTTP Basic auth. The static credential authenticates the sender,
    not the body.
    """
    username = username if username is not None else os.environ.get("HOSTAWAY_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("HOSTAWAY_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured
    creds = parse_basic_auth(headers.get("authorization"))
    if creds is None:
        return False
    # Evaluate both comparisons before deciding (no short-circuit).
    user_ok = safe_equal(creds[0], username)
    pass_ok = safe_equal(creds[1], password)
    return user_ok and pass_ok


async def require_hostaway_credentials(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read, for every method."""
    if not verify_hostaway_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Basic credentials")


def get_event_name(payload):
    """The unified webhook payload isn't documented field by field, so read the event name
    defensively: `event`, `eventType`, or `object` + `action` (e.g. reservation + created).
    """
    if not isinstance(payload, dict):
        return None
    if isinstance(payload.get("event"), str):
        return payload["event"]
    if isinstance(payload.get("eventType"), str):
        return payload["eventType"]
    if isinstance(payload.get("object"), str) and isinstance(payload.get("action"), str):
        return f"{payload['object']}.{payload['action']}"
    return None


def handle_event(payload) -> None:
    event = get_event_name(payload)

    if event == "reservation.created":
        print("Reservation created")
        # TODO: sync the new booking (payload["data"])

    elif event == "reservation.updated":
        print("Reservation updated")
        # TODO: update the stored booking

    elif event == "message.received":
        print("Guest message received")
        # TODO: route the message to your inbox

    elif event == "task.created":
        print("Task created")
        # TODO: create the matching task

    elif event == "task.updated":
        print("Task updated")
        # TODO: update the matching task

    else:
        # Unknown shape: log the top-level keys (not the values) so you can extend this handler.
        keys = list(payload.keys()) if isinstance(payload, dict) else type(payload).__name__
        print(f"Unhandled event: {event}", keys)


@app.api_route(
    "/webhooks/hostaway",
    methods=ALLOWED_METHODS,
    dependencies=[Depends(require_hostaway_credentials)],
)
async def hostaway_webhook(request: Request):
    # Read the raw body so any content type is accepted; an empty body is fine.
    raw_body = await request.body()

    payload = None
    if raw_body.strip():
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            # The body format isn't documented: acknowledge and log rather than reject.
            print(f"Non-JSON body ({len(raw_body)} bytes) on {request.method}")
    else:
        print(f"Empty body on {request.method}")

    if payload is not None:
        try:
            handle_event(payload)
        except Exception as err:  # noqa: BLE001
            print(f"Error handling Hostaway event: {err}")
            raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
