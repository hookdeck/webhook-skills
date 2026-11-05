# Generated with: workspace-one-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hmac
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
    Omnissa's page doesn't say whether they arrive on the first request or only after
    a 401 challenge, so check the headers of a test notification.
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


def store_notification(raw_body: bytes, content_type) -> None:
    """Omnissa documents the event labels but no payload, so this reads no field from the
    body. Store the raw body and Content-Type, then write your parser from real
    notifications captured from your tenant.
    """
    print(f"Workspace ONE notification: {len(raw_body)} bytes, {content_type}")


@app.post("/webhooks/workspace-one", dependencies=[Depends(require_workspace_one_auth)])
async def workspace_one_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        store_notification(raw_body, request.headers.get("content-type"))
    except Exception as err:  # noqa: BLE001
        print(f"Error storing Workspace ONE notification: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
