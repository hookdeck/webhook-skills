# Generated with: sendx-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# SendX puts an INTEGER code in the body's top-level `type` (one code per sending surface)
SENDX_EVENTS = {
    74: "ContactCreated",
    73: "GlobalUnsubscribe",
    7: "MailOpen", 32: "DripStepMailOpen", 172: "RssExecMailOpen", 189: "WorkflowEmailMailOpen", 271: "SeedContactMailOpen",
    8: "LinkClick", 33: "DripStepLinkClick", 173: "RssExecLinkClick", 190: "WorkflowEmailLinkClick", 272: "SeedContactLinkClick",
    5: "MailBounced", 63: "DripStepMailBounced", 180: "RssExecMailBounced", 197: "WorkflowEmailMailBounced", 276: "SeedContactMailBounced",
    6: "MailSpam", 62: "DripStepMailSpam", 179: "RssExecMailSpam", 196: "WorkflowEmailMailSpam", 275: "SeedContactMailSpam",
    60: "MailDropped", 61: "DripStepMailDropped", 178: "RssExecMailDropped", 195: "WorkflowEmailMailDropped", 278: "SeedContactMailDropped",
}

_HEX_DIGEST = re.compile(r"[0-9a-fA-F]{64}")


def verify_sendx_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    """Verify a SendX webhook signature.

    SendX sends ``X-SendX-Signature: <hex>``, the bare lowercase hex HMAC-SHA256 of the raw
    request body, keyed with the team API key (UTF-8 bytes, used as-is). No timestamp is signed.
    """
    # Check the shape first (exact length and alphabet); fullmatch so a trailing newline fails
    if not signature_header or not _HEX_DIGEST.fullmatch(signature_header):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    # Compare bytes, never str
    return hmac.compare_digest(bytes.fromhex(signature_header), expected)


def get_event_type(payload) -> int | None:
    """Return the integer `type` code, or None if the body has none (the field is untrusted)."""
    if not isinstance(payload, dict):
        return None
    event_type = payload.get("type")
    if isinstance(event_type, bool):
        return None
    if isinstance(event_type, int):
        return event_type
    if isinstance(event_type, str) and re.fullmatch(r"[0-9]+", event_type):
        return int(event_type)
    return None


@app.post("/webhooks/sendx")
async def sendx_webhook(request: Request):
    secret = os.environ.get("SENDX_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Read the raw bytes BEFORE parsing: the signature covers the exact body (any content type)
    raw_body = await request.body()

    if not verify_sendx_signature(raw_body, request.headers.get("x-sendx-signature"), secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except ValueError:  # includes JSONDecodeError and UnicodeDecodeError
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object")

    event_type = get_event_type(payload)
    name = SENDX_EVENTS.get(event_type) if event_type is not None else None
    # X-SendX-Webhook-Id identifies a delivery; use it for idempotency since SendX retries
    delivery_id = request.headers.get("x-sendx-webhook-id", "(no id)")

    if name:
        print(f"SendX event {name} (type {event_type}), delivery {delivery_id}")
    else:
        print(f"Unhandled SendX event type: {json.dumps(payload.get('type'))}")

    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
