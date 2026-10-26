# Generated with: rocketlane-webhooks skill
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

# Scheme is case-insensitive; the payload must be one token of strict base64 characters.
BASIC_HEADER = re.compile(r"^basic[ \t]+(\S+)$", re.IGNORECASE)


def parse_basic_auth(header):
    """Parse `Authorization: Basic base64(username:password)` into (username, password) bytes.

    validate=True rejects anything outside the base64 alphabet, so valid credentials
    followed by junk are refused. Split on the FIRST colon (the password may contain
    colons). Returns None if the header is missing or malformed.
    """
    if not header:
        return None
    match = BASIC_HEADER.match(header.strip())
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


def verify_rocketlane_request(headers, config=os.environ) -> bool:
    """Rocketlane does not sign payloads. The only authentication is HTTP Basic auth, which
    must arrive on the first request (Hookdeck never answers with a 401 challenge). Both
    the username and the password are compared before deciding, so there is no short-circuit.
    """
    expected_user = config.get("ROCKETLANE_WEBHOOK_USERNAME")
    expected_pass = config.get("ROCKETLANE_WEBHOOK_PASSWORD")
    if not expected_user or not expected_pass:
        return False  # never accept when unconfigured
    creds = parse_basic_auth(headers.get("authorization"))
    if creds is None:
        return False
    username, password = creds
    # compare_digest on bytes: str with non-ASCII characters would raise TypeError.
    user_ok = hmac.compare_digest(username, expected_user.encode("utf-8"))
    pass_ok = hmac.compare_digest(password, expected_pass.encode("utf-8"))
    return user_ok and pass_ok


async def require_rocketlane_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_rocketlane_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Basic authentication")


def handle_event(payload: dict) -> None:
    event_type = payload.get("eventType")
    task = (payload.get("data") or {}).get("task") or {}

    if event_type == "TASK_CREATED":
        print(f"Task created: {task.get('taskId')} {task.get('taskName')}")
        # TODO: create the matching task in your system

    elif event_type == "TASK_UPDATED":
        changed = (payload.get("changeLog") or {}).get("changedFields") or []
        print(f"Task updated: {task.get('taskId')}, changed: {', '.join(changed)}")
        # TODO: apply payload["changeLog"]["to"] to your copy of the task

    elif event_type == "TASK_DELETED":
        print(f"Task deleted: {task.get('taskId')}")
        # TODO: remove the task from your system

    elif event_type in ("PROJECT_CREATED", "PROJECT_UPDATED", "PROJECT_ARCHIVED", "PROJECT_DELETED"):
        print(f"{event_type} (event {payload.get('eventId')})")
        # TODO: sync the project

    elif event_type in ("PHASE_CREATED", "PHASE_UPDATED", "PHASE_DELETED"):
        print(f"{event_type} (event {payload.get('eventId')})")
        # TODO: sync the phase

    else:
        print(f"Unhandled Rocketlane event type: {event_type}")


@app.post("/webhooks/rocketlane", dependencies=[Depends(require_rocketlane_auth)])
async def rocketlane_webhook(request: Request):
    # Read the raw body so any content type works.
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
        print(f"Error handling Rocketlane webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    # Rocketlane counts only 200 or 204 as delivered, and times out after 10 seconds.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
