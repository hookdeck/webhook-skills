# Generated with: svix-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Svix Webhook Handler")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/webhooks/svix")
async def svix_webhook(
    request: Request,
    # Svix sends svix-* headers; Standard Webhooks senders may use webhook-*.
    svix_id: str = Header(None),
    svix_timestamp: str = Header(None),
    svix_signature: str = Header(None),
    webhook_id: str = Header(None),
    webhook_timestamp: str = Header(None),
    webhook_signature: str = Header(None),
):
    """Receive and verify a Svix webhook using the official svix SDK."""
    msg_id = svix_id or webhook_id
    timestamp = svix_timestamp or webhook_timestamp
    signature = svix_signature or webhook_signature
    if not all([msg_id, timestamp, signature]):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    secret = os.environ.get("SVIX_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("Invalid webhook secret configuration")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Verify against the RAW body — never a re-serialized payload.
    body = await request.body()
    wh = Webhook(secret)
    try:
        # The SDK enforces the 5-minute tolerance and checks every signature in
        # constant time. As of svix 2.x it verifies only and returns None, so the
        # payload is parsed separately below.
        wh.verify(
            body,
            {
                "svix-id": msg_id,
                "svix-timestamp": timestamp,
                "svix-signature": signature,
            },
        )
    except WebhookVerificationError as err:
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        print(f"Webhook verification failed: {err}")
        raise HTTPException(status_code=400, detail=detail)

    # Verified — only now is it safe to parse.
    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Events are defined by the upstream sender; envelope is { type, data }.
    event_type = event.get("type", "unknown")
    event_data = event.get("data", {})

    print(f"Received Svix webhook: {event_type}")

    if event_type == "invoice.paid":
        print(f"Invoice paid: {event_data.get('id')}")
        # TODO: fulfil the order / issue a receipt
    elif event_type == "user.created":
        print(f"User created: {event_data.get('id')}")
        # TODO: provision resources for the new user
    elif event_type == "user.updated":
        print(f"User updated: {event_data.get('id')}")
        # TODO: sync the updated user record
    elif event_type == "message.sent":
        print(f"Message sent: {event_data.get('id')}")
        # TODO: update delivery status
    else:
        print(f"Unhandled event type: {event_type}")

    return JSONResponse(content={"success": True, "type": event_type}, status_code=200)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
