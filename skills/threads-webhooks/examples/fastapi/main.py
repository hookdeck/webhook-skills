# Generated with: threads-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import re
import hmac
import hashlib
import json
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import PlainTextResponse

load_dotenv()

app = FastAPI()

SIGNATURE_PATTERN = re.compile(r"sha256=([0-9a-fA-F]{64})")


def get_app_secret() -> str:
    return os.environ.get("THREADS_APP_SECRET", "")


def get_verify_token() -> str:
    return os.environ.get("THREADS_VERIFY_TOKEN", "")


def verify_threads_signature(raw_body: bytes, signature_header: Optional[str], app_secret: str) -> bool:
    """Verify a Threads (Meta) webhook signature.

    Meta sends ``X-Hub-Signature-256: sha256=<hex>``, the HMAC-SHA256 hex digest
    of the RAW request body keyed with the app secret. The pattern requires
    exactly 64 hex characters (a non-ASCII header simply fails to match, giving
    401 instead of a 500), and the comparison is done on bytes.
    """
    if not signature_header or not app_secret:
        return False

    match = SIGNATURE_PATTERN.fullmatch(signature_header)
    if not match:
        return False

    expected = hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    return hmac.compare_digest(
        match.group(1).lower().encode("ascii"),
        expected.encode("ascii"),
    )


def handle_notification(notification: dict) -> None:
    """Dispatch one notification. Threads sends a flat object:
    { app_id, topic, target_id, time, subscription_id, values: { field, value } }"""
    values = notification.get("values") or {}
    field = values.get("field")
    value = values.get("value") or {}

    if field == "replies":
        replied_to = (value.get("replied_to") or {}).get("id")
        print(f"Reply {value.get('id')} by @{value.get('username')} to post {replied_to}")
        # TODO: Moderate or respond to the reply.
    elif field == "mentions":
        print(f"Mention in post {value.get('id')} by @{value.get('username')}")
        # TODO: Social listening / alerts.
    elif field == "publish":
        print(f"Post {value.get('id')} published by @{value.get('username')}")
        # TODO: Sync published posts.
    elif field == "delete":
        print(f"Post {value.get('id')} deleted at {value.get('deleted_at')}")
        # TODO: Remove the post from your own store.
    else:
        print(f"Unhandled Threads field: {field}")


@app.get("/webhooks/threads")
async def verify_webhook(request: Request):
    """GET verification handshake: Meta sends this when the Callback URL is saved."""
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    verify_token = get_verify_token()
    if (
        mode == "subscribe"
        and token
        and verify_token
        and hmac.compare_digest(token.encode("utf-8"), verify_token.encode("utf-8"))
    ):
        # Echo the challenge back verbatim as plain text.
        return PlainTextResponse(content=challenge or "", status_code=200)

    raise HTTPException(status_code=403, detail="Forbidden")


@app.post("/webhooks/threads")
async def receive_webhook(request: Request):
    """POST event delivery: use the raw body for signature verification."""
    raw_body = await request.body()
    signature_header = request.headers.get("x-hub-signature-256")

    if not verify_threads_signature(raw_body, signature_header, get_app_secret()):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification.
    try:
        notification = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(notification, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    print(f"Received Threads {notification.get('topic')} notification")
    handle_notification(notification)

    return PlainTextResponse(content="EVENT_RECEIVED", status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
