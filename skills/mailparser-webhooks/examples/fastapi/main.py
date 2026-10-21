# Generated with: mailparser-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Mailparser webhook receiver (FastAPI).

MAILPARSER WEBHOOK AUTHENTICATION

Mailparser does NOT sign webhooks: its docs describe no signature header,
HMAC or timestamp. An Advanced Webhook has an "Additional Headers" field (one
``Name: value`` per line) sent unchanged on every request, e.g.
``X-Webhook-Secret: <random>`` or ``Authorization: Basic ...``. Compare the
WHOLE value, in constant time.
"""

import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI(title="Mailparser Webhooks")


def header_name(env=None) -> str:
    """Header name to check. Starlette header lookups are case-insensitive."""
    env = os.environ if env is None else env
    return (env.get("MAILPARSER_WEBHOOK_HEADER") or "x-webhook-secret").strip().lower()


def verify_mailparser_header(received: str | None, expected: str | None) -> bool:
    """Constant-time compare of the received header value."""
    if not received or not expected:
        return False
    return hmac.compare_digest(received.encode("utf-8"), expected.encode("utf-8"))


def body_hash(raw_body: bytes) -> str:
    """No event ID exists, so hash the raw body as a fallback idempotency key."""
    return hashlib.sha256(raw_body).hexdigest()


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/mailparser")
async def mailparser_webhook(request: Request):
    expected = os.getenv("MAILPARSER_WEBHOOK_SECRET")

    # Fail closed on misconfiguration: 500, so it's distinguishable from a bad credential.
    if not expected:
        print("MAILPARSER_WEBHOOK_SECRET is not set — refusing unauthenticated webhooks")
        return JSONResponse({"error": "Webhook authentication not configured"}, status_code=500)

    name = header_name()
    received = request.headers.get(name)
    if not received:
        return JSONResponse({"error": f"Missing {name} header"}, status_code=401)

    if not verify_mailparser_header(received, expected):
        print(f"Mailparser webhook {name} header mismatch")
        return JSONResponse({"error": f"Invalid {name} header"}, status_code=401)

    # Authenticate first, then parse the raw body.
    raw = await request.body()
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(payload, dict):
        return JSONResponse({"error": "Invalid payload"}, status_code=400)

    print(f"✓ Authenticated Mailparser webhook ({body_hash(raw)[:12]})")

    handle_parsed_email(payload)

    return {"received": True}


def handle_parsed_email(payload: dict) -> None:
    """Mailparser has no event types: the body is the parsed data you defined in
    the HTTP Body Payload Template, so field names are your parsing-rule names."""
    # TODO: check body_hash (or a unique parsed field) against your store and return if seen.
    print(f"📧 Parsed email data with {len(payload)} field(s): {', '.join(payload)}")
