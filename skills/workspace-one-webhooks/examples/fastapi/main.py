# Generated with: workspace-one-webhooks skill
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

BASIC_RE = re.compile(r"^basic\s+(\S+)$", re.IGNORECASE)


def verify_workspace_one_request(headers, username=None, password=None) -> bool:
    """Workspace ONE UEM does not sign event notifications. It sends the User Name and
    Password from the Event Notifications rule as HTTP Basic auth:
        Authorization: Basic base64(username:password)
    The credentials must be on the first request; a 401 + WWW-Authenticate challenge
    flow won't work (Hookdeck verifies the request as received).
    """
    username = username if username is not None else os.environ.get("WORKSPACE_ONE_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("WORKSPACE_ONE_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured

    match = BASIC_RE.match((headers.get("authorization") or "").strip())
    if not match:
        return False
    try:
        decoded = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        return False

    user_b, sep, pass_b = decoded.partition(b":")  # split on the FIRST colon
    if not sep:
        return False

    # compare_digest on bytes (str raises on non-ASCII). Evaluate both before deciding.
    user_ok = hmac.compare_digest(user_b, username.encode("utf-8"))
    pass_ok = hmac.compare_digest(pass_b, password.encode("utf-8"))
    return user_ok and pass_ok


async def require_workspace_one_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_workspace_one_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Basic credentials")


def normalize(value) -> str:
    """Lowercase letters and digits only, so 'Check-in/Check-out' and 'check in check out' match."""
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def parse_body(raw: bytes) -> dict:
    """The page documents the event labels but no payload. JSON bodies use an illustrative
    shape ({"EventType": "Device Enrollment", "DeviceId": 123, "EnrollmentUserName": "jdoe"});
    XML bodies are accepted and EventType is read from the <EventType> element.
    """
    text = raw.decode("utf-8").strip()
    if text.startswith("<"):
        m = re.search(r"<EventType>\s*([^<]*?)\s*</EventType>", text)
        return {"EventType": m.group(1) if m else None}
    payload = json.loads(text)
    if not isinstance(payload, dict):
        raise ValueError("Expected a JSON object")
    return payload


def handle_event(payload: dict) -> None:
    event_type = payload.get("EventType")
    device = payload.get("DeviceId")
    key = normalize(event_type)

    if key == normalize("Check-in/Check-out"):
        print(f"Multi-user device check-in/out: {device}")

    elif key == normalize("Device Attribute Change"):
        print(f"Device attribute changed: {device}")

    elif key == normalize("Device Compliance Status Change"):
        print(f"Compliance status changed: {device}")

    elif key == normalize("Device Compromised Status Change"):
        print(f"Compromised status changed: {device}")

    elif key == normalize("Device Delete"):
        print(f"Device deleted: {device}")

    elif key == normalize("Device Enrollment"):
        print(f"Device enrolled: {device} ({payload.get('EnrollmentUserName')})")

    elif key == normalize("Device Unenrolled Enterprise Wipe"):
        print(f"Enterprise wipe: {device}")

    elif key == normalize("Device Wipe"):
        print(f"Device wiped: {device}")

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/workspace-one", dependencies=[Depends(require_workspace_one_auth)])
async def workspace_one_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = parse_body(raw_body)
    except (ValueError, UnicodeDecodeError):  # JSONDecodeError is a ValueError
        raise HTTPException(status_code=400, detail="Body must be a JSON object or XML")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Workspace ONE event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
