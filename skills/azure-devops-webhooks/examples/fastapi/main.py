# Generated with: azure-devops-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hashlib
import hmac
import json
import os
import re
from typing import Optional, Tuple

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

_BASIC_RE = re.compile(r"^basic +([A-Za-z0-9+/]+={0,2})\s*$", re.IGNORECASE)


def safe_equal(a: bytes, b: bytes) -> bool:
    """Constant-time comparison of bytes (compare_digest on equal-length digests).

    Always pass bytes: hmac.compare_digest raises TypeError on non-ASCII str.
    """
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())


def parse_basic_auth(header: Optional[str]) -> Optional[Tuple[bytes, bytes]]:
    """Parse "Authorization: Basic base64(username:password)".

    The scheme is case-insensitive and the credentials are split on the FIRST
    colon (the password may contain colons). Returns None if missing or malformed.
    """
    if not header:
        return None
    match = _BASIC_RE.match(header)
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


def verify_azure_devops_request(headers, username=None, password=None) -> bool:
    """Azure DevOps does not sign Web Hooks payloads. The subscription's basic
    authentication credentials arrive on every request; they authenticate the
    sender, not the body, and give no replay protection. Both fields are compared
    before deciding, so there is no short-circuit.
    """
    username = username if username is not None else os.environ.get("AZURE_DEVOPS_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("AZURE_DEVOPS_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured
    creds = parse_basic_auth(headers.get("authorization"))
    if creds is None:
        return False
    user_ok = safe_equal(creds[0], username.encode("utf-8"))
    pass_ok = safe_equal(creds[1], password.encode("utf-8"))
    return user_ok and pass_ok


async def require_basic_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_azure_devops_request(request.headers):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing basic authentication credentials",
            headers={"WWW-Authenticate": 'Basic realm="azure-devops-webhooks"'},
        )


def handle_event(payload: dict) -> None:
    event_type = payload.get("eventType")
    message = payload.get("message")
    text = message.get("text") if isinstance(message, dict) else None

    if event_type == "git.push":
        print(f"Push: {text}")
        # TODO: trigger a build or sync (payload["resource"]["refUpdates"], ["commits"])

    elif event_type == "git.pullrequest.created":
        print(f"Pull request created: {text}")
        # TODO: start a review workflow (payload["resource"]["pullRequestId"])

    elif event_type == "git.pullrequest.updated":
        print(f"Pull request updated: {text}")
        # TODO: refresh the review state

    elif event_type == "git.pullrequest.merged":
        print(f"Pull request merged: {text}")
        # TODO: deploy or close linked tickets

    elif event_type == "workitem.created":
        print(f"Work item created: {text}")
        # TODO: sync payload["resource"]["fields"] to your tracker

    elif event_type == "workitem.updated":
        print(f"Work item updated: {text}")
        # TODO: apply payload["resource"]["fields"] changes

    elif event_type == "workitem.commented":
        print(f"Work item commented: {text}")
        # TODO: sync the comment

    elif event_type == "build.complete":
        print(f"Build complete: {text}")
        # TODO: report payload["resource"]["status"] / ["result"]

    elif event_type == "ms.vss-pipelines.run-state-changed-event":
        print(f"Pipeline run state changed: {text}")
        # TODO: report payload["resource"]["run"]["state"] / ["result"]

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/azure-devops", dependencies=[Depends(require_basic_auth)])
async def azure_devops_webhook(request: Request):
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
        print(f"Error handling Azure DevOps event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
