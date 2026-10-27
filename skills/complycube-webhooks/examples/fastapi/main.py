# Generated with: complycube-webhooks skill
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

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_complycube_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    """Verify a ComplyCube webhook signature.

    ComplyCube sends ``ComplyCube-Signature: <hex>`` (no prefix): the lowercase hex HMAC-SHA256 of
    the raw request body bytes, keyed with the webhook's secret. Nothing else is signed.
    Both sides are compared as bytes so a non-ASCII header is rejected, not a 500.
    """
    if not signature_header or not HEX_SHA256.fullmatch(signature_header):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest().encode("ascii")
    return hmac.compare_digest(signature_header.lower().encode("ascii"), expected)


@app.post("/webhooks/complycube")
async def complycube_webhook(request: Request):
    secret = os.environ.get("COMPLYCUBE_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Read the raw bytes BEFORE parsing: the signature covers the exact body (any content type)
    raw_body = await request.body()
    signature = request.headers.get("complycube-signature")

    if not verify_complycube_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except ValueError:  # includes JSONDecodeError and UnicodeDecodeError
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict) or not isinstance(event.get("type"), str):
        raise HTTPException(status_code=400, detail="Invalid event")

    # event["id"] is stable across retries: use it for idempotency (duplicates and reordering happen)
    event_type = event["type"]
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    event_id = event.get("id")

    if event_type == "check.completed":
        print(f"Check {payload.get('id')} completed (any outcome) [event {event_id}]")
    elif event_type in (
        "check.completed.clear",
        "check.completed.attention",
        "check.completed.rejected",
        "check.completed.match_confirmed",
    ):
        print(f"Check {payload.get('id')} outcome: {event_type.split('.')[2]} [event {event_id}]")
    elif event_type == "check.failed":
        print(f"Check {payload.get('id')} failed [event {event_id}]")
    elif event_type == "client.created":
        print(f"Client {payload.get('id')} created [event {event_id}]")
    elif event_type == "workflow.session.completed":
        print(f"Workflow session {payload.get('id')} completed [event {event_id}]")
    else:
        print(f"Unhandled ComplyCube event: {event_type} [event {event_id}]")

    # Acknowledge with a 20x within 15 seconds, or ComplyCube retries and eventually disables the webhook
    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
