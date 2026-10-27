# Generated with: memos-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from standardwebhooks.webhooks import Webhook

load_dotenv()

app = FastAPI(title="Memos Webhook Handler")

# Memos treats any response without JSON {"code":0} as a failed delivery, so every accepted delivery gets it
ACK = {"code": 0}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """Memos sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


def create_verifier(secret: str) -> Webhook:
    """A whsec_ secret is base64-decoded after the prefix; any other value is used as its raw bytes (as Memos does)."""
    return Webhook(secret if secret.startswith("whsec_") else secret.encode("utf-8"))


def error(status: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": message})


@app.post("/webhooks/memos")
async def memos_webhook(request: Request):
    secret = os.environ.get("MEMOS_WEBHOOK_SECRET")
    if not secret:
        print("MEMOS_WEBHOOK_SECRET is not set")
        return error(500, "Server configuration error")

    sig_headers = read_signature_headers(request.headers)
    if not all(sig_headers.values()):
        return error(400, "Missing required webhook headers")

    # Verify the RAW body: the exact bytes Memos signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # A malformed signature entry raises ValueError rather than WebhookVerificationError, so catch Exception.
        create_verifier(secret).verify(raw_body, sig_headers, json_parse=False)
    except Exception as err:
        print(f"Memos webhook verification failed: {err}")
        return error(401, "Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        return error(400, "Invalid JSON")
    if not isinstance(event, dict):
        return error(400, "Invalid JSON")

    # The body is { url, activityType, creator, memo }; the event name is the top-level activityType
    activity_type = event.get("activityType")
    creator = event.get("creator")
    # webhook-id is stable across retries and the body has no event id: use it to deduplicate
    print(f"Received Memos webhook {sig_headers['webhook-id']}: {activity_type}")

    if activity_type == "memos.memo.created":
        print(f"Memo created by: {creator}")
    elif activity_type == "memos.memo.updated":
        print(f"Memo updated by: {creator}")
    elif activity_type == "memos.memo.deleted":
        print(f"Memo deleted by: {creator}")
    elif activity_type == "memos.memo.comment.created":
        print(f"Memo comment created by: {creator}")
    else:
        # The documented list may grow: acknowledge what you don't handle so Memos doesn't count a failure
        print(f"Unhandled activity type: {activity_type}")

    return ACK


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
