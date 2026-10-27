# Generated with: tidio-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


def _as_str(value):
    """A JSON string field, or "" when the field is missing or another type."""
    return value if isinstance(value, str) else ""


load_dotenv()

app = FastAPI()

SIGNATURE_RE = re.compile(r"[0-9a-fA-F]{64}")

# In-memory dedupe for the example; use a shared store (Redis, database) in production.
processed_webhook_ids: set = set()


def parse_signature_header(header: str):
    """Parse `x-tidio-signature: t=<unix seconds>,s=<hex>[,s=<hex>...]`.

    The header is never trimmed or re-formatted: `t` is used exactly as sent.
    """
    timestamp: Optional[str] = None
    signatures = []
    for item in header.split(","):
        key, sep, value = item.partition("=")
        if not sep:
            continue
        if key == "t" and timestamp is None:
            timestamp = value
        elif key == "s":
            signatures.append(value)
    return timestamp, signatures


def verify_tidio_signature(
    raw_body: bytes, header: Optional[str], secret: str, tolerance_seconds: float = 0
) -> bool:
    """Signed bytes are `<raw body>_<t>`; the HMAC key is the secret's UTF-8 bytes;
    the signature is hex HMAC-SHA256. Valid if ANY `s` matches."""
    if not header or not secret:
        return False
    timestamp, signatures = parse_signature_header(header)
    if not timestamp or not signatures:
        return False

    # Opt-in replay window (t is Unix seconds). Off by default: Hookdeck retries
    # and replays resend the original timestamp.
    if tolerance_seconds > 0:
        if not re.fullmatch(r"[0-9]+", timestamp):
            return False
        if abs(time.time() - int(timestamp)) > tolerance_seconds:
            return False

    signed_bytes = b"".join([raw_body, b"_", timestamp.encode("latin-1")])
    expected = hmac.new(secret.encode("utf-8"), signed_bytes, hashlib.sha256).hexdigest().encode("ascii")

    valid = False
    for signature in signatures:
        if not SIGNATURE_RE.fullmatch(signature):  # exact length and alphabet first
            continue
        if hmac.compare_digest(signature.lower().encode("ascii"), expected):
            valid = True
    return valid


def handle_event(topic: str, content: dict) -> None:
    if topic in ("contact.created", "contact.updated"):
        print(f"{topic}: contact {content.get('id')} ({content.get('email') or 'no email'})")
    elif topic in ("conversation.solved_by_operator", "conversation.solved_automatically"):
        print(f"{topic}: contact {content.get('contact_id')} at {content.get('solved_at')}")
    elif topic == "conversation.solved_by_lyro":
        print(f"{topic}: contact {content.get('contact_id')}, reason {content.get('reason')}")
    elif topic == "ticket.created":
        print(f"{topic}: ticket {content.get('id')} \"{content.get('subject')}\" ({content.get('status')})")
    elif topic == "ticket.status_updated":
        print(f"{topic}: ticket {content.get('id')} is now {content.get('status')}")
    elif topic == "ticket.replied":
        print(f"{topic}: ticket {content.get('id')}")
    elif topic == "customer_satisfaction.rated":
        print(f"{topic}: {content.get('type')} rated {content.get('score')}/5")
    else:
        print(f"Unhandled Tidio topic: {topic}")


@app.post("/webhooks/tidio")
async def tidio_webhook(request: Request):
    secret = os.getenv("TIDIO_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes for ANY content type: this is exactly what Tidio signed.
    raw_body = await request.body()
    try:
        tolerance = float(os.getenv("TIDIO_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0

    if not verify_tidio_signature(raw_body, request.headers.get("x-tidio-signature"), secret, tolerance):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification.
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    webhook_id = event.get("webhook_id") if isinstance(event.get("webhook_id"), str) else None
    if webhook_id:
        if webhook_id in processed_webhook_ids:
            return {"received": True, "duplicate": True}
        processed_webhook_ids.add(webhook_id)

    handle_event(_as_str(event.get("topic")), _as_dict(event.get("content")))
    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
