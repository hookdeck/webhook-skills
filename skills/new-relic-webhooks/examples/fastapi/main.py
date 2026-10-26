# Generated with: new-relic-webhooks skill
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

_BASIC = re.compile(r"^basic\s+([A-Za-z0-9+/]+={0,2})\s*$", re.IGNORECASE)


def safe_equal(a: bytes, b: bytes) -> bool:
    """Constant-time comparison (compare_digest on equal-length digests of bytes)."""
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())


def verify_new_relic_request(headers, username=None, password=None) -> bool:
    """New Relic does not sign webhooks. A Webhook destination can send
    "Authorization: Basic base64(username:password)", which authenticates the sender
    only. It does not cover the body and gives no replay protection.
    """
    username = username if username is not None else os.environ.get("NEW_RELIC_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("NEW_RELIC_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured

    match = _BASIC.match(headers.get("authorization") or "")
    if not match:
        return False
    try:
        decoded = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        return False

    # Split on the FIRST colon: passwords may contain ':'.
    user_part, sep, pass_part = decoded.partition(b":")
    if not sep:
        return False

    # Evaluate both comparisons before deciding (no short-circuit). Compare bytes, never str.
    user_ok = safe_equal(user_part, username.encode("utf-8"))
    pass_ok = safe_equal(pass_part, password.encode("utf-8"))
    return user_ok and pass_ok


async def require_new_relic_basic_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_new_relic_request(request.headers):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing Basic credentials",
            headers={"WWW-Authenticate": 'Basic realm="new-relic"'},
        )


def handle_issue(payload: dict) -> None:
    # The payload comes from a Handlebars template you write in the workflow, so there is
    # no fixed event field. This handler assumes the illustrative template in
    # references/setup.md, which sends issueId, title, state, acknowledged, priority and
    # issuePageUrl. state is New Relic's issue life cycle state (CREATED, ACTIVATED, CLOSED);
    # acknowledged is its isAcknowledged boolean.
    issue_id = payload.get("issueId")
    title = payload.get("title")
    priority = payload.get("priority")
    url = payload.get("issuePageUrl")
    state = str(payload.get("state") or "").upper()
    acknowledged = payload.get("acknowledged") in (True, "true")

    if state in ("CREATED", "ACTIVATED"):
        if acknowledged:
            print(f"Issue acknowledged: {issue_id} {title}")
            # TODO: mark the ticket as being worked
        else:
            print(f"Issue {state.lower()}: {issue_id} {title} ({priority}) {url}")
            # TODO: page on-call or open a ticket

    elif state == "CLOSED":
        print(f"Issue closed: {issue_id} {title}")
        # TODO: close the matching ticket

    else:
        print(f"Unhandled state: {payload.get('state')}")


@app.post("/webhooks/new-relic", dependencies=[Depends(require_new_relic_basic_auth)])
async def new_relic_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_issue(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling New Relic notification: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
