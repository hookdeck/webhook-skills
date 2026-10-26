# Generated with: braze-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hmac
import json
import os
import re
from typing import Optional, Tuple

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Braze lets the marketer pick the HTTP method, so accept all of these.
ALLOWED_METHODS = ["POST", "PUT", "PATCH", "GET", "DELETE"]

_BASIC = re.compile(r"^basic\s+([A-Za-z0-9+/]+={0,2})$", re.IGNORECASE)


def parse_basic_auth(header: Optional[str]) -> Optional[Tuple[bytes, bytes]]:
    """Parse 'Authorization: Basic base64(username:password)' into raw bytes.
    The scheme is case-insensitive; split on the FIRST colon (passwords may contain ':').
    """
    if not header:
        return None
    match = _BASIC.match(header.strip())
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


def verify_braze_request(headers, username: Optional[str] = None, password: Optional[str] = None) -> bool:
    """Braze does not sign webhooks. A Basic authentication credential saved in
    Settings > Credential Management supplies the Authorization header. This checks it.
    Both fields are compared before deciding (no short-circuit); compare bytes, never str.
    """
    username = username if username is not None else os.environ.get("BRAZE_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("BRAZE_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured
    creds = parse_basic_auth(headers.get("authorization"))
    if creds is None:
        return False
    user_ok = hmac.compare_digest(creds[0], username.encode("utf-8"))
    pass_ok = hmac.compare_digest(creds[1], password.encode("utf-8"))
    return user_ok and pass_ok


async def require_braze_basic_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read."""
    if not verify_braze_request(request.headers):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing Basic credentials",
            headers={"WWW-Authenticate": 'Basic realm="braze-webhook"'},
        )


def parse_body(raw: bytes):
    """The body is whatever the marketer composed: JSON, raw text (XML, form data) or nothing (GET)."""
    text = raw.decode("utf-8", errors="replace")
    if not text.strip():
        return "empty", None
    try:
        return "json", json.loads(text)
    except json.JSONDecodeError:
        return "text", text


def handle_request(method: str, kind: str, body) -> None:
    if kind == "json":
        # Braze adds no event field. Illustrative body: {"message_body": "Your order just arrived!", "user_id": "u_123"}
        print(f"Braze {method} with JSON body: {body}")
        # TODO: act on the keys your campaign or Canvas step composes
    elif kind == "text":
        print(f"Braze {method} with text body: {body[:200]}")
        # TODO: parse the raw text format your message uses (XML, form data, ...)
    else:
        print(f"Braze {method} with no body")


@app.api_route(
    "/webhooks/braze",
    methods=ALLOWED_METHODS,
    dependencies=[Depends(require_braze_basic_auth)],
)
async def braze_webhook(request: Request):
    # Read the raw body so any content type is accepted; GET yields b"".
    raw_body = await request.body()
    kind, body = parse_body(raw_body)

    try:
        handle_request(request.method, kind, body)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Braze webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
