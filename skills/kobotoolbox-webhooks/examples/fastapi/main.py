# Generated with: kobotoolbox-webhooks skill
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

_BASIC_RE = re.compile(r"^basic +([A-Za-z0-9+/]+=*)\s*$", re.IGNORECASE)


def safe_equal(a: bytes, b: bytes) -> bool:
    """Constant-time comparison of two byte strings (compare_digest on equal-length digests).

    Always pass bytes: hmac.compare_digest raises TypeError on non-ASCII str.
    """
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())


def parse_basic_auth(header):
    """Parse "Authorization: Basic base64(username:password)".

    The scheme is case-insensitive and the credentials split on the FIRST colon
    (passwords may contain colons). Returns (username, password) bytes or None.
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


def verify_kobotoolbox_request(headers, username=None, password=None) -> bool:
    """KoboToolbox REST Services do not sign requests. They send HTTP Basic auth on
    every request; a static credential, so it authenticates the sender, not the body.
    Both comparisons run before deciding (no short-circuit).
    """
    username = username if username is not None else os.environ.get("KOBOTOOLBOX_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("KOBOTOOLBOX_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured
    creds = parse_basic_auth(headers.get("authorization"))
    if creds is None:
        return False
    user_ok = safe_equal(creds[0], username.encode("utf-8"))
    pass_ok = safe_equal(creds[1], password.encode("utf-8"))
    return user_ok and pass_ok


async def require_basic_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read."""
    if not verify_kobotoolbox_request(request.headers):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing Basic credentials",
            headers={"WWW-Authenticate": 'Basic realm="kobotoolbox"'},
        )


def handle_submission(body, fmt: str) -> None:
    """A REST Service fires once per new submission. There is no event type: the body
    is the submission (JSON or XML, optionally a subset of fields or a custom wrapper).
    """
    if fmt == "json" and isinstance(body, dict):
        print(f"New submission {body.get('_id')} ({body.get('_xform_id_string')}) at {body.get('_submission_time')}")
        # TODO: store the submission; use body["_uuid"] or body["_id"] to deduplicate retries
    else:
        print(f"New submission ({fmt}, {len(str(body))} chars)")
        # TODO: parse the XML submission (or your custom wrapper) with your XML library


@app.post("/webhooks/kobotoolbox", dependencies=[Depends(require_basic_auth)])
async def kobotoolbox_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw = (await request.body()).decode("utf-8", errors="replace")

    # JSON when it parses as JSON; otherwise keep the raw text (XML format).
    try:
        body, fmt = json.loads(raw), "json"
    except json.JSONDecodeError:
        body, fmt = raw, "xml/text"

    try:
        handle_submission(body, fmt)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling KoboToolbox submission: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
