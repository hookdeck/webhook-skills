# Generated with: microsoft-teams-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Microsoft Teams outgoing webhook receiver for FastAPI.

Teams outgoing webhooks send   Authorization: HMAC <base64>
= base64(HMAC-SHA256(key = base64-DECODED security token, raw UTF-8 body)).
Teams waits about 5 seconds and posts the JSON response as a reply to the
message that @mentioned the webhook (public channels only).
"""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import re
from typing import Any, Dict, Optional, Union

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("microsoft-teams-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Microsoft Teams Outgoing Webhook Handler")


def _b64decode(value: str) -> Optional[bytes]:
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        return None


def verify_teams_request(
    raw_body: Union[bytes, str],
    authorization: Optional[str],
    security_token: Optional[str],
) -> bool:
    """Check the Authorization header against the raw request body."""
    if not authorization or not security_token:
        return False
    match = re.fullmatch(r"HMAC (\S+)", authorization.strip(), re.IGNORECASE)
    if not match:
        return False

    # The token is base64: the HMAC key is its decoded bytes, not the string.
    # Trim a pasted trailing newline; reject a malformed token.
    key = _b64decode(security_token.strip())
    if not key:
        return False

    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(key, raw_body, hashlib.sha256).digest()
    given = _b64decode(match.group(1))
    return given is not None and hmac.compare_digest(given, expected)


def command_text(text: Optional[str]) -> str:
    """'<at>Helper</at> status' -> 'status' (also drops other HTML tags)."""
    text = re.sub(r"<at>.*?</at>", " ", str(text or ""), flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip()


def build_reply(activity: Dict[str, Any]) -> Dict[str, str]:
    """Build the reply Teams posts in the thread. Keep it fast: Teams times out
    after about 5 seconds. Push slow work to a queue and acknowledge here."""
    command = command_text(activity.get("text")).lower()
    sender = activity.get("from") or {}
    who = (sender.get("name") if isinstance(sender, dict) else None) or "there"
    if command in ("help", ""):
        return {"type": "message", "text": "Commands: status, help"}
    if command == "status":
        return {"type": "message", "text": f"Hi {who}, all systems are operational."}
    return {"type": "message", "text": 'Unknown command. Try "help".'}


@app.post("/webhooks/microsoft-teams")
async def microsoft_teams_webhook(request: Request):
    security_token = os.environ.get("MICROSOFT_TEAMS_SECURITY_TOKEN")
    if not security_token:
        logger.error("MICROSOFT_TEAMS_SECURITY_TOKEN is not set: rejecting request")
        return JSONResponse({"error": "Security token not configured"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_teams_request(raw_body, request.headers.get("authorization"), security_token):
        return JSONResponse({"error": "Invalid HMAC signature"}, status_code=401)

    try:
        activity = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(activity, dict):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    sender = activity.get("from") or {}
    logger.info(
        "Teams message %s from %s: %s",
        activity.get("id"),
        sender.get("name") if isinstance(sender, dict) else None,
        command_text(activity.get("text")),
    )

    # Teams posts this JSON as a reply to the message that mentioned the webhook.
    return build_reply(activity)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
