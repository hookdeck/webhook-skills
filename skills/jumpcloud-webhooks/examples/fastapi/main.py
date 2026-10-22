# Generated with: jumpcloud-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

_BASIC_RE = re.compile(r"^basic +([A-Za-z0-9+/]+={0,2})$", re.IGNORECASE)


def safe_equal(a: bytes, b: bytes) -> bool:
    """Constant-time comparison (compare_digest on equal-length digests of bytes)."""
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())


def parse_basic_auth(header):
    """Parse 'Authorization: Basic base64(username:password)'.

    The scheme is case-insensitive and the value splits on the FIRST colon.
    Returns (username, password) as bytes, or None if missing or malformed.
    """
    if not header:
        return None
    match = _BASIC_RE.match(header.strip())
    if not match:
        return None
    try:
        decoded = base64.b64decode(match.group(1) + "=" * (-len(match.group(1)) % 4), validate=True)
    except (binascii.Error, ValueError):
        return None
    username, sep, password = decoded.partition(b":")
    if not sep:
        return None
    return username, password


def verify_jumpcloud_request(headers, username=None, password=None) -> bool:
    """JumpCloud webhook channels are not signed. With Basic Authentication selected,
    every request carries the channel's username and password. Compare both in
    constant time and evaluate both before deciding (no short-circuit).
    """
    username = username if username is not None else os.environ.get("JUMPCLOUD_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("JUMPCLOUD_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured
    creds = parse_basic_auth(headers.get("authorization"))
    if creds is None:
        return False
    user_ok = safe_equal(creds[0], username.encode("utf-8"))
    pass_ok = safe_equal(creds[1], password.encode("utf-8"))
    return user_ok and pass_ok


async def require_jumpcloud_basic_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_jumpcloud_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Basic credentials")


def handle_alert(alert: dict) -> None:
    # JumpCloud documents the field names but no example body or category values.
    print(
        f"JumpCloud alert {alert.get('alert_id')} \"{alert.get('alert_title')}\" "
        f"[{alert.get('priority')}/{alert.get('status')}] "
        f"category={alert.get('category')} di_event={alert.get('di_event')}"
    )
    # TODO: open or update a ticket keyed on alert_id; route on priority and status


@app.post("/webhooks/jumpcloud", dependencies=[Depends(require_jumpcloud_basic_auth)])
async def jumpcloud_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_alert(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling JumpCloud alert: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
