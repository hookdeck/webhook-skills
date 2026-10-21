# Generated with: mailjet-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("mailjet")
app = FastAPI()


def _safe_equal(a: str, b: str) -> bool:
    # Compare SHA-256 digests so unequal lengths don't leak length
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )


def verify_basic_auth(header: Optional[str], username: str, password: str) -> bool:
    """Mailjet has no signature: it sends the user:pass from the webhook URL
    as an `Authorization: Basic ...` header."""
    if not header or header[:6].lower() != "basic ":
        return False
    try:
        decoded = base64.b64decode(header[6:].strip(), validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return False
    user, sep, pwd = decoded.partition(":")  # password may itself contain ':'
    if not sep:
        return False
    # Evaluate both comparisons (no short-circuit) so timing doesn't reveal which failed
    user_ok = _safe_equal(user, username)
    pass_ok = _safe_equal(pwd, password)
    return user_ok and pass_ok


def handle_event(event: dict) -> None:
    name = event["event"]
    email = event.get("email")
    if name == "sent":
        logger.info("Sent to %s: %s", email, event.get("smtp_reply"))
    elif name == "open":
        logger.info("Opened by %s", email)
    elif name == "click":
        logger.info("Clicked %s by %s", event.get("url"), email)
    elif name == "bounce":
        # hard_bounce=true means a permanent failure
        kind = "hard" if event.get("hard_bounce") else "soft"
        logger.info("Bounce (%s) for %s: %s", kind, email, event.get("error"))
    elif name == "blocked":
        logger.info("Blocked for %s: %s", email, event.get("error"))
    elif name == "spam":
        logger.info("Spam complaint from %s (source: %s)", email, event.get("source"))
    elif name == "unsub":
        logger.info("Unsubscribed %s from list %s", email, event.get("mj_list_id"))
    else:
        logger.info("Unhandled Mailjet event: %s", name)


@app.post("/webhooks/mailjet")
async def mailjet_webhook(
    request: Request, authorization: Optional[str] = Header(default=None)
):
    username = os.environ.get("MAILJET_WEBHOOK_USERNAME")
    password = os.environ.get("MAILJET_WEBHOOK_PASSWORD")
    if not username or not password:
        logger.error("MAILJET_WEBHOOK_USERNAME / MAILJET_WEBHOOK_PASSWORD not set")
        return JSONResponse({"error": "Webhook credentials not configured"}, status_code=500)

    if not verify_basic_auth(authorization, username, password):
        return JSONResponse(
            {"error": "Unauthorized"},
            status_code=401,
            headers={"WWW-Authenticate": 'Basic realm="mailjet"'},
        )

    # Read the raw bytes, then parse after authenticating
    try:
        payload = json.loads(await request.body())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    # With grouped events (version 2) Mailjet posts an array; otherwise one object
    events = payload if isinstance(payload, list) else [payload]
    if not all(isinstance(e, dict) and isinstance(e.get("event"), str) for e in events):
        return JSONResponse({"error": "Invalid event payload"}, status_code=400)

    for event in events:
        handle_event(event)
    return {"received": len(events)}
