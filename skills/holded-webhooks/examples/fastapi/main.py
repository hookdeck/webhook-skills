# Generated with: holded-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

SIGNATURE_PREFIX = "sha256="
_HEX_64 = re.compile(r"[0-9a-fA-F]{64}")

# In-memory idempotency store; use Redis or a database in production.
processed_ids: set[str] = set()


def verify_holded_signature(
    raw_body: bytes, header: str | None, secret: str
) -> tuple[bool, str | None]:
    """Verify a Holded webhook signature.

    Header:    x-holded-webhook-signature: sha256=<64 hex chars>
    Signed:    the raw request body only (x-holded-webhook-date is NOT signed)
    Algorithm: HMAC-SHA256, hex digest, keyed with the whole secret string as
               UTF-8, including the whsec_ prefix (this is not Standard Webhooks)
    """
    if not header:
        return False, "Missing x-holded-webhook-signature header"
    if not header.startswith(SIGNATURE_PREFIX):
        return False, "Signature must start with sha256="

    received = header[len(SIGNATURE_PREFIX):]
    if not _HEX_64.fullmatch(received):
        return False, "Malformed signature"

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes, not str: compare_digest raises TypeError on non-ASCII str.
    if hmac.compare_digest(expected.encode("utf-8"), received.lower().encode("utf-8")):
        return True, None
    return False, "Invalid signature"


def handle_event(event_name: str, data: dict) -> None:
    if event_name in (
        "invoice.create",
        "invoice.update",
        "invoice.approve",
        "invoice.delete",
        "contact.create",
        "contact.update",
        "contact.delete",
        "payment.create",
        "payment.update",
        "payment.delete",
        "stock.update",
    ):
        print(f"Holded {event_name}: {data.get('id')}")
    else:
        # Other document types (creditnote.*, purchase.*, product.*, ...) are
        # acknowledged too: a non-2xx makes Holded retry.
        print(f"Unhandled Holded event: {event_name}")


@app.post("/webhooks/holded")
async def holded_webhook(request: Request):
    secret = os.environ.get("HOLDED_WEBHOOK_SECRET")
    if not secret:
        print("HOLDED_WEBHOOK_SECRET is not set")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # request.body() gives the exact bytes Holded signed, for any content type.
    raw_body = await request.body()

    valid, error = verify_holded_signature(
        raw_body, request.headers.get("x-holded-webhook-signature"), secret
    )
    if not valid:
        print(f"Holded signature verification failed: {error}")
        return JSONResponse({"error": error}, status_code=401)

    try:
        data = json.loads(raw_body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(data, dict):
        data = {}

    # The event name travels in a header, alongside the signed body.
    event_name = request.headers.get("x-holded-webhook-event") or "unknown"
    event_id = request.headers.get("x-holded-webhook-id")

    # x-holded-webhook-id is Holded's idempotency key (deliveries are retried).
    if event_id and event_id in processed_ids:
        return {"received": True, "duplicate": True}

    handle_event(event_name, data)
    if event_id:
        processed_ids.add(event_id)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
