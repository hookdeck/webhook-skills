# Generated with: thinkific-webhooks skill
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


def verify_thinkific_signature(raw_body: bytes, signature, secret=None) -> bool:
    """Verify X-Thinkific-Hmac-Sha256: the hex HMAC-SHA256 of the raw request body, keyed with
    the secret's UTF-8 bytes. Nothing else is signed (no timestamp or id), so there is no replay
    window. `raw_body` must be the exact bytes received.
    """
    secret = secret if secret is not None else os.environ.get("THINKIFIC_WEBHOOK_SECRET")
    if not secret or not signature or HEX_SHA256.fullmatch(signature) is None:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Bytes, never str: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))


def handle_event(event: dict) -> None:
    """Dispatch on `resource` and `action`. cart.abandoned uses a different envelope
    (`name` + `data`), so fall back to `name` when there is no resource.
    """
    resource = event.get("resource")
    action = event.get("action")
    topic = f"{resource}.{action}" if resource else event.get("name")
    payload = event.get("payload") or event.get("data") or {}
    if not isinstance(payload, dict):
        payload = {}

    if resource == "order":
        print(f"Order {payload.get('id')} ({topic}): {payload.get('product_name')} for {payload.get('amount_cents')} cents")
        # TODO: fulfil the order or record the sale

    elif resource == "order_transaction":
        print(f"Transaction {payload.get('id')} {action}")  # succeeded, failed, refunded
        # TODO: update payment state

    elif resource == "enrollment":
        print(f"Enrollment {payload.get('id')} {action}")
        # TODO: grant access, send a certificate on "completed"

    elif resource == "user":
        print(f"User {payload.get('id')} {action}")  # signup, signin, updated, deleted
        # TODO: sync the user record

    elif resource == "course":
        print(f"Course {payload.get('id')} {action}")  # created, updated, deleted

    else:
        print(f"Unhandled Thinkific event: {topic}")


@app.post("/webhooks/thinkific")
async def thinkific_webhook(request: Request):
    # Read the exact bytes (any content type) and verify before parsing anything.
    raw_body = await request.body()
    signature = request.headers.get("x-thinkific-hmac-sha256")

    if not verify_thinkific_signature(raw_body, signature):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Thinkific-Hmac-Sha256 signature")

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Thinkific event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
