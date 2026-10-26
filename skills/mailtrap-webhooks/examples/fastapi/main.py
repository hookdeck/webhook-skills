# Generated with: mailtrap-webhooks skill
# https://github.com/hookdeck/webhook-skills

"""Mailtrap webhook receiver.

Mailtrap signs every webhook with a `Mailtrap-Signature` header: the lowercase
hex HMAC-SHA256 of the RAW request body, keyed with the webhook's signing secret
(32 hex characters) used as a plain UTF-8 string. No timestamp, no prefix.

https://docs.mailtrap.io/email-api-smtp/advanced/webhooks#webhook-signature-verification
"""

import hashlib
import hmac
import json
import os
import re
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI(title="Mailtrap Webhook Handler")

_HEX_SHA256 = re.compile(r"^[0-9a-f]{64}$", re.IGNORECASE)


# === Signature verification ================================================


def verify_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """Verify a Mailtrap `Mailtrap-Signature` header.

    The received value must be 64 hex chars. Both sides are encoded to bytes
    before hmac.compare_digest so a non-ASCII header is a clean rejection (401),
    not a TypeError (500).
    """
    if not signature or not secret:
        return False
    received = signature.strip()
    if not _HEX_SHA256.fullmatch(received):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(received.lower().encode("utf-8"), expected.encode("utf-8"))


# === Payload parsing =======================================================


def parse_events(raw_body: bytes) -> list[dict[str, Any]]:
    """A delivery is `{"events": [...]}` (JSON) or one event object per line
    (JSON Lines), up to 500 events per request. Raises ValueError if malformed."""
    text = raw_body.decode("utf-8")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = None
        events = [json.loads(line) for line in text.splitlines() if line.strip()]
        if not events or not all(isinstance(e, dict) for e in events):
            raise ValueError("Unexpected payload shape")
        return events
    if isinstance(parsed, dict):
        if isinstance(parsed.get("events"), list):
            return parsed["events"]
        return [parsed]  # single-line JSON Lines
    raise ValueError("Unexpected payload shape")


# === Event handling ========================================================

# Dedupe on `event_id`. Use a shared, durable store (Redis, Postgres) in
# production; this set is per-process.
_processed_event_ids: set[str] = set()


def already_processed(event_id: Optional[str]) -> bool:
    if not event_id:
        return False
    if event_id in _processed_event_ids:
        return True
    _processed_event_ids.add(event_id)
    return False


def handle_event(evt: dict[str, Any]) -> None:
    """Dispatch one event. `soft bounce` has a space; Audit Log events
    (Enterprise) are `activity_log.*`."""
    name = evt.get("event")
    if name == "delivery":
        print(f"Delivered {evt.get('message_id')} to {evt.get('email')}")
    elif name == "open":
        print(f"Opened by {evt.get('email')}")
    elif name == "click":
        print(f"Click by {evt.get('email')}: {evt.get('url')}")
    elif name == "unsubscribe":
        print(f"Unsubscribe from {evt.get('email')}")
    elif name == "spam":
        print(f"SPAM complaint from {evt.get('email')}")
    elif name == "soft bounce":
        print(f"Soft bounce for {evt.get('email')}: {evt.get('response_code')} {evt.get('bounce_category')}")
    elif name == "bounce":
        print(f"Hard bounce for {evt.get('email')}: {evt.get('response_code')} {evt.get('bounce_category')}")
    elif name == "suspension":
        print(f"Message suspended for {evt.get('email')}: {evt.get('reason')}")
    elif name == "reject":
        print(f"Message rejected for {evt.get('email')}: {evt.get('reason')}")
    elif isinstance(name, str) and name.startswith("activity_log."):
        print(f"Audit log {name}: {evt.get('description')}")
    else:
        print(f"Unhandled Mailtrap event: {name}")


# === Routes ================================================================


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/mailtrap")
async def mailtrap_webhook(request: Request):
    secret = os.getenv("MAILTRAP_WEBHOOK_SECRET")
    if not secret:
        return JSONResponse({"error": "Server configuration error"}, status_code=500)

    signature = request.headers.get("mailtrap-signature")
    if not signature:
        return JSONResponse({"error": "Missing Mailtrap-Signature header"}, status_code=400)

    # Raw bytes, whatever the content type (application/json or application/jsonl)
    raw_body = await request.body()
    if not verify_signature(raw_body, signature, secret):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        events = parse_events(raw_body)
    except ValueError:  # includes UnicodeDecodeError and JSONDecodeError
        return JSONResponse({"error": "Invalid payload"}, status_code=400)

    # Any non-200 makes Mailtrap retry (40 times, every 5 minutes).
    for evt in events:
        if not isinstance(evt, dict) or already_processed(evt.get("event_id")):
            continue
        try:
            handle_event(evt)
        except Exception as exc:  # noqa: BLE001
            print(f"Error handling Mailtrap event: {exc}")
    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
