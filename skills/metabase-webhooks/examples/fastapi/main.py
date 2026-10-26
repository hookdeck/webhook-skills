# Generated with: metabase-webhooks skill
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

_BASIC = re.compile(r"basic +(\S+)", re.IGNORECASE)


def safe_equal(a: bytes, b: bytes) -> bool:
    """Constant-time comparison (compare_digest on equal-length digests of bytes)."""
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())


def verify_metabase_request(headers, username=None, password=None) -> bool:
    """Metabase does not sign payloads. With "Basic" authentication it sends
    `Authorization: Basic base64(username:password)` on every request, up front.
    A static credential authenticates the sender, not the body, and gives no replay
    protection: use HTTPS and rotate the credential if it leaks.
    """
    username = username if username is not None else os.environ.get("METABASE_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("METABASE_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured

    header = headers.get("authorization")
    if not header:
        return False

    # Scheme is case-insensitive; the credentials must be strict base64.
    match = _BASIC.fullmatch(header.strip())
    if not match:
        return False
    try:
        decoded = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        return False

    # Split on the first colon only: the password may contain colons.
    user_bytes, sep, pass_bytes = decoded.partition(b":")
    if not sep:
        return False

    # Evaluate both comparisons before deciding (no short-circuit).
    user_ok = safe_equal(user_bytes, username.encode("utf-8"))
    pass_ok = safe_equal(pass_bytes, password.encode("utf-8"))
    return user_ok and pass_ok


async def require_basic_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_metabase_request(request.headers):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing Basic credentials",
            headers={"WWW-Authenticate": 'Basic realm="metabase-webhook"'},
        )


def handle_event(payload: dict) -> None:
    event = payload.get("type")

    if event == "alert":
        data = payload.get("data") or {}
        raw_data = data.get("raw_data") or {}
        rows = len(raw_data.get("rows") or [])
        test = " (test alert)" if payload.get("alert_id") is None else ""
        print(
            f"Alert{test}: {data.get('question_name')} (#{data.get('question_id')}) "
            f"returned {rows} rows {data.get('question_url')}"
        )
        # TODO: forward to chat/on-call, store raw_data, or decode data["visualization"] (base64 PNG)

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/metabase", dependencies=[Depends(require_basic_auth)])
async def metabase_webhook(request: Request):
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
        print(f"Error handling Metabase event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
