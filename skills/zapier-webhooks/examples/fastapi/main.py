# Generated with: zapier-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Receiver for the "Webhooks by Zapier" action (POST / PUT / Custom Request).

Zapier does NOT sign these requests: no signature header, no HMAC, no signing
secret. Authenticate with a secret you put into the Zap yourself:

  - Headers section:  X-Webhook-Secret | <ZAPIER_WEBHOOK_SECRET>
  - Basic Auth field: <username>|<password>  (sent as Authorization: Basic ...)

Both are compared in constant time. The payload is whatever you defined in the
action's Data section, so there is no fixed schema and no event type.
"""
import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
from typing import Any, Optional
from urllib.parse import parse_qsl

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("zapier-webhooks")
app = FastAPI()

SECRET_HEADER = "x-webhook-secret"


def safe_equal(a: Optional[str], b: str) -> bool:
    """Constant-time compare. Hash both sides first so the comparison doesn't
    reveal the secret's length (same as the Node examples)."""
    if a is None:
        return False
    return hmac.compare_digest(hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest())


def verify_secret_header(header_value: Optional[str], secret: str) -> bool:
    return bool(secret) and safe_equal(header_value, secret)


def verify_basic_auth(authorization: Optional[str], username: str, password: str) -> bool:
    if not username or not password or not authorization:
        return False
    scheme, _, encoded = authorization.partition(" ")
    if scheme.lower() != "basic" or not encoded.strip():
        return False
    try:
        decoded = base64.b64decode(encoded.strip(), validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return False
    return safe_equal(decoded, f"{username}:{password}")


def verify_zapier_request(headers) -> Optional[bool]:
    """Returns None when no method is configured, so the caller can fail closed."""
    secret = os.environ.get("ZAPIER_WEBHOOK_SECRET", "")
    username = os.environ.get("ZAPIER_BASIC_AUTH_USERNAME", "")
    password = os.environ.get("ZAPIER_BASIC_AUTH_PASSWORD", "")
    header_configured = bool(secret)
    basic_configured = bool(username and password)
    if not header_configured and not basic_configured:
        return None

    return (header_configured and verify_secret_header(headers.get(SECRET_HEADER), secret)) or (
        basic_configured and verify_basic_auth(headers.get("authorization"), username, password)
    )


async def require_zapier_auth(request: Request) -> None:
    """FastAPI dependency: authenticate before the body is parsed."""
    result = verify_zapier_request(request.headers)
    if result is None:
        logger.error("Zapier webhook refused: no ZAPIER_WEBHOOK_SECRET or Basic Auth credentials set")
        raise HTTPException(status_code=500, detail="Webhook authentication not configured")
    if not result:
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")


def parse_body(raw_body: bytes, content_type: str) -> Any:
    """Payload Type in the Zap decides the Content-Type: JSON, Form
    (URL-encoded), or XML / Raw / Custom Request text, returned as-is."""
    text = raw_body.decode("utf-8")
    if "application/json" in content_type:
        return json.loads(text)
    if "application/x-www-form-urlencoded" in content_type:
        return dict(parse_qsl(text, keep_blank_values=True))
    return text


def handle_zap_action(payload: Any) -> str:
    """Handle one Zap action run. The fields are the keys you entered in the
    Data section (or every field from the previous step if Data was left
    blank). If several Zaps share this endpoint, add an `event` field in Data
    and dispatch on it."""
    event = payload.get("event") if isinstance(payload, dict) else None
    if not isinstance(event, str):
        event = "zap action"

    # if event == "lead.created":  # a value YOU chose in the Zap's Data section
    #     create_lead(payload)
    logger.info("Zapier %s: %s", event, payload)
    return event


@app.api_route("/webhooks/zapier", methods=["POST", "PUT", "PATCH", "DELETE"], dependencies=[Depends(require_zapier_auth)])
async def zapier_webhook(request: Request):
    raw_body = await request.body()
    try:
        payload = parse_body(raw_body, request.headers.get("content-type", ""))
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid request body")

    event = handle_zap_action(payload)
    # Zapier marks the action step as errored on a non-2xx response.
    return {"received": True, "event": event}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
