# Generated with: 360dialog-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hashlib
import hmac
import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()

_BASIC = re.compile(r"^basic\s+(\S+)\s*$", re.IGNORECASE)


def safe_equal(a: bytes, b: bytes) -> bool:
    """Constant-time comparison of two byte strings.

    hmac.compare_digest raises TypeError for non-ASCII ``str``, so always pass bytes.
    Hashing both sides first keeps the comparison independent of length.
    """
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())


def parse_basic_auth(authorization: Optional[str]) -> Optional[Tuple[bytes, bytes]]:
    """Parse ``Authorization: Basic base64(username:password)``.

    The scheme is case-insensitive and the value is split on the FIRST colon (passwords may
    contain ':'). Returns None when the header is missing or malformed.
    """
    if not authorization:
        return None
    match = _BASIC.match(authorization)
    if not match:
        return None
    try:
        decoded = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        return None
    username, sep, password = decoded.partition(b":")
    if not sep:
        return None
    return username, password


def verify_360dialog_request(
    authorization: Optional[str], username: Optional[str], password: Optional[str]
) -> bool:
    """360dialog does not sign webhooks. You set ``Authorization: Basic base64(USER:PASS)``
    in the ``headers`` object when setting the webhook URL, and 360dialog sends it with every
    request. Compare username and password separately, evaluating both before deciding.
    """
    if not username or not password:
        return False  # never accept when unconfigured
    creds = parse_basic_auth(authorization)
    if creds is None:
        return False
    user_ok = safe_equal(creds[0], username.encode())
    pass_ok = safe_equal(creds[1], password.encode())
    return user_ok and pass_ok


def require_360dialog_auth(authorization: Optional[str] = Header(None)) -> None:
    """FastAPI dependency that authenticates the request before the body is read."""
    username = os.getenv("THREE_SIXTY_DIALOG_WEBHOOK_USERNAME")
    password = os.getenv("THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD")

    # Fail closed: without a configured credential there is nothing to check.
    if not username or not password:
        print("Set THREE_SIXTY_DIALOG_WEBHOOK_USERNAME and THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD")
        raise HTTPException(status_code=500, detail="Webhook authentication not configured")

    if not verify_360dialog_request(authorization, username, password):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def extract_events(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Flatten a 360dialog (WhatsApp Cloud API) body into a list of events.

    - Meta format: entry[].changes[] with a ``field``. ``messages`` carries value.messages
      (inbound), value.statuses (delivery updates) or value.errors; Coexistence adds the
      ``smb_message_echoes``, ``history`` and ``smb_app_state_sync`` fields.
    - Envelope format: {id, event, data}, used in the docs for history and smb_app_state_sync.
    """
    events: List[Dict[str, Any]] = []
    entries = payload.get("entry")

    if isinstance(entries, list):
        for entry in entries:
            for change in (entry or {}).get("changes") or []:
                field = change.get("field")
                value = change.get("value") or {}
                if field == "messages":
                    for message in value.get("messages") or []:
                        events.append({"kind": "message", "value": value, "message": message})
                    for status in value.get("statuses") or []:
                        events.append({"kind": "status", "value": value, "status": status})
                    for error in value.get("errors") or []:
                        events.append({"kind": "error", "value": value, "error": error})
                else:
                    events.append({"kind": field or "unknown", "value": value})
    elif isinstance(payload.get("event"), str):
        events.append({"kind": payload["event"], "value": payload.get("data") or {}})

    return events


def handle_event(event: Dict[str, Any]) -> None:
    kind = event["kind"]
    value = event["value"]

    if kind == "message":
        m = event["message"]
        # m["type"]: text, image, video, audio, document, sticker, location, contacts,
        # reaction, interactive, button, order, system, unsupported, ...
        print(f"Inbound {m.get('type')} message {m.get('id')} from {m.get('from')}")
        # TODO: process the inbound message (acknowledge fast, do real work asynchronously)
    elif kind == "status":
        s = event["status"]
        # s["status"]: sent, delivered, read, failed, played
        print(f"Message {s.get('id')} to {s.get('recipient_id')}: {s.get('status')}")
        # TODO: update delivery state (log s["errors"] when status is failed)
    elif kind == "error":
        e = event["error"]
        print(f"Operational error {e.get('code')}: {e.get('title')}")
    elif kind == "smb_message_echoes":
        print(f"Echoed {len(value.get('message_echoes') or [])} message(s) sent from the WhatsApp Business app")
        # TODO: record messages the business sent from the app (Coexistence)
    elif kind == "history":
        print("Chat history sync event")
        # TODO: store history chunks (Coexistence)
    elif kind == "smb_app_state_sync":
        print(f"Contact state sync: {len(value.get('state_sync') or [])} change(s)")
        # TODO: sync contacts (Coexistence)
    else:
        print(f"Unhandled 360dialog event: {kind}")


@app.post("/webhooks/360dialog", dependencies=[Depends(require_360dialog_auth)])
async def handle_360dialog_webhook(request: Request):
    """Receive 360dialog webhooks. The dependency authenticates before the body is read, and
    the raw body is parsed as JSON so any content type works."""
    raw = await request.body()
    try:
        payload = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    for event in extract_events(payload):
        handle_event(event)

    # 360dialog needs a 200 within 5 seconds, otherwise it retries
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
