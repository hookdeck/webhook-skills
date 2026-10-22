import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_sendbird_webhook(raw_body: bytes, signature_header: str | None, api_token: str | None) -> bool:
    """Verify x-sendbird-signature: hex HMAC-SHA256 of the raw body keyed with the MASTER API token."""
    if not signature_header or not api_token:
        return False

    expected = hmac.new(
        api_token.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Timing-safe comparison (case-insensitive hex)
    return hmac.compare_digest(signature_header.strip().lower().encode(), expected.encode())


@app.post("/webhooks/sendbird")
async def sendbird_webhook(request: Request):
    api_token = os.environ.get("SENDBIRD_API_TOKEN")
    if not api_token:
        raise HTTPException(status_code=500, detail="Webhook not configured")

    # Raw body for signature verification (any content type)
    raw_body = await request.body()
    signature = request.headers.get("x-sendbird-signature")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing x-sendbird-signature header")

    if not verify_sendbird_webhook(raw_body, signature, api_token):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    category = payload.get("category")
    channel_url = (payload.get("channel") or {}).get("channel_url")
    sender_id = (payload.get("sender") or {}).get("user_id")
    print(f"Received {category} event")

    if category == "group_channel:message_send":
        message = (payload.get("payload") or {}).get("message")
        print(f"Group message from {sender_id} in {channel_url}: {message}")
        # TODO: Offline push, SMS/email notification, moderation, etc.

    elif category == "group_channel:create":
        print(f"Group channel created: {channel_url}")

    elif category == "group_channel:join":
        print(f"User joined group channel: {channel_url}")

    elif category == "group_channel:leave":
        print(f"User left group channel: {channel_url}")

    elif category == "open_channel:message_send":
        message = (payload.get("payload") or {}).get("message")
        print(f"Open channel message from {sender_id} in {channel_url}: {message}")

    elif category == "user:block":
        print("User blocked another user")
        # TODO: Update your own block lists, audit log, etc.

    elif category == "user:unblock":
        print("User unblocked another user")

    else:
        print(f"Unhandled event: {category}")

    # Respond quickly: Sendbird waits 5 seconds and retries up to 3 times
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
