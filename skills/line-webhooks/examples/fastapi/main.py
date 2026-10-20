# Generated with: line-webhooks skill
# https://github.com/hookdeck/webhook-skills
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from linebot.v3 import SignatureValidator

load_dotenv()

app = FastAPI()


def verify_line_signature(raw_body: bytes, signature: Optional[str], channel_secret: Optional[str]) -> bool:
    """Verify a LINE webhook signature.

    LINE signs the raw request body with HMAC-SHA256 keyed on the channel secret
    and sends the base64 digest in x-line-signature. The SDK's SignatureValidator
    recomputes it and compares with hmac.compare_digest.
    """
    if not signature or not channel_secret:
        return False
    try:
        # LINE always sends UTF-8; the SDK takes the body as text and re-encodes it
        # as UTF-8, which round-trips the exact bytes that were signed.
        body = raw_body.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return SignatureValidator(channel_secret).validate(body, signature)


def handle_event(event: dict) -> None:
    """Handle a single LINE webhook event object."""
    event_type = event.get("type")
    source = event.get("source") or {}

    if event_type == "message":
        # message.type: text, image, video, audio, file, location, sticker
        message = event["message"]
        print(f"Message ({message['type']}) from {source.get('userId')}: {message.get('text', message['id'])}")
        # TODO: Reply with event["replyToken"] via the Messaging API reply endpoint

    elif event_type == "messageEdited":
        print(f"Message edited: {event['message']['id']}")
        # TODO: Update the stored copy of the message (latest timestamp wins)

    elif event_type == "unsend":
        print(f"Message unsent: {event['unsend']['messageId']}")
        # TODO: Delete the stored message so it can't be seen or used again

    elif event_type == "follow":
        print(f"Followed by {source.get('userId')} (unblocked: {event.get('follow', {}).get('isUnblocked')})")
        # TODO: Send a welcome message, create the user record

    elif event_type == "unfollow":
        print(f"Blocked by {source.get('userId')}")
        # TODO: Stop messaging this user

    elif event_type == "join":
        print(f"Joined {source.get('type')}: {source.get('groupId') or source.get('roomId')}")

    elif event_type == "leave":
        print(f"Left {source.get('type')}: {source.get('groupId') or source.get('roomId')}")

    elif event_type == "memberJoined":
        print(f"Members joined: {[m.get('userId') for m in event['joined']['members']]}")

    elif event_type == "memberLeft":
        print(f"Members left: {[m.get('userId') for m in event['left']['members']]}")

    elif event_type == "postback":
        print(f"Postback: {event['postback']['data']}")
        # TODO: Route on postback.data (and postback.params for date/time pickers)

    elif event_type == "videoPlayComplete":
        print(f"Video watched: {event['videoPlayComplete']['trackingId']}")

    elif event_type == "beacon":
        print(f"Beacon {event['beacon']['type']}: {event['beacon']['hwid']}")

    elif event_type == "accountLink":
        print(f"Account link {event['link']['result']}, nonce: {event['link']['nonce']}")
        # TODO: Look up the nonce and link accounts if result == "ok"

    elif event_type == "membership":
        print(f"Membership {event['membership']['type']}: {event['membership']['membershipId']}")

    else:
        print(f"Unhandled event type: {event_type}")


@app.post("/webhooks/line")
async def line_webhook(
    request: Request,
    x_line_signature: Optional[str] = Header(default=None),
):
    if not x_line_signature:
        raise HTTPException(status_code=400, detail="Missing x-line-signature header")

    # Raw bytes - verify BEFORE parsing, never a re-serialized body
    raw_body = await request.body()

    if not verify_line_signature(raw_body, x_line_signature, os.environ.get("LINE_CHANNEL_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    events = payload.get("events") if isinstance(payload.get("events"), list) else []

    # The console "Verify" button sends {"destination": "...", "events": []} - acknowledge it
    if not events:
        print(f"Webhook verification request for {payload.get('destination')}")
        return {"received": True}

    for event in events:
        if (event.get("deliveryContext") or {}).get("isRedelivery"):
            # Redelivered events keep the same webhookEventId - dedupe on it
            print(f"Redelivered event: {event.get('webhookEventId')}")
        handle_event(event)

    # Return 2xx quickly; LINE redelivers (if enabled) only on non-2xx responses
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
