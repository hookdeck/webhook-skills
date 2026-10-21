# Generated with: zernio-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Event ids already handled. Use a database or cache with a unique index in production.
processed_events: set = set()


def verify_zernio_webhook(raw_body: bytes, signature_header: Optional[str], secret: Optional[str]) -> bool:
    """Verify a Zernio webhook signature.

    X-Zernio-Signature is the lowercase hex HMAC-SHA256 of the raw body, keyed with your secret.
    """
    if not signature_header or not secret:
        return False

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature_header, expected_signature)


@app.post("/webhooks/zernio")
async def zernio_webhook(request: Request):
    # Raw body is required for signature verification
    raw_body = await request.body()
    signature = request.headers.get("x-zernio-signature") or request.headers.get("x-late-signature")

    if not signature:
        raise HTTPException(status_code=401, detail="No signature provided")

    if not verify_zernio_webhook(raw_body, signature, os.environ.get("ZERNIO_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Zernio delivers at least once: payload["id"] (= X-Zernio-Event-Id) is stable across retries
    event_id = payload.get("id")
    if event_id in processed_events:
        return {"received": True, "duplicate": True}
    processed_events.add(event_id)

    event = payload.get("event")
    post = payload.get("post") or {}
    account = payload.get("account") or {}
    message = payload.get("message")

    print(f"Received {event} event (id: {event_id})")

    if event == "webhook.test":
        print(f"Test event: {message}")

    elif event == "post.scheduled":
        print(f"Post {post.get('id')} scheduled for {post.get('scheduledFor')}")

    elif event == "post.published":
        print(f"Post {post.get('id')} published")
        # TODO: Store platforms[].publishedUrl, notify the author, etc.

    elif event == "post.partial":
        print(f"Post {post.get('id')} published on some platforms only")
        # TODO: Retry the failed targets

    elif event == "post.failed":
        print(f"Post {post.get('id')} failed on every platform")
        # TODO: Alert the author, inspect platforms[].errorCategory

    elif event == "post.platform.published":
        print(f"Post {post.get('id')} published on one platform")

    elif event == "post.platform.failed":
        print(f"Post {post.get('id')} failed on one platform")

    elif event == "message.received":
        msg = message if isinstance(message, dict) else {}
        print(f"Message on {msg.get('platform')}: {msg.get('text')}")
        # TODO: Route to support, reply via the inbox API

    elif event == "comment.received":
        print(f"Comment received on account {account.get('accountId')}")

    elif event == "account.connected":
        print(f"Account connected: {account.get('platform')} @{account.get('username')}")

    elif event == "account.disconnected":
        print(f"Account disconnected ({account.get('disconnectionType')}): {account.get('reason')}")
        # TODO: Prompt the user to reconnect

    else:
        print(f"Unhandled event: {event}")

    # Return 2xx within 5 seconds; do heavy work in the background
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
