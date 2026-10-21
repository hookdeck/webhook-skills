# Generated with: pusher-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os

import pusher
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def pusher_client() -> pusher.Pusher:
    return pusher.Pusher(
        app_id=os.environ["PUSHER_APP_ID"],
        key=os.environ["PUSHER_APP_KEY"],
        secret=os.environ["PUSHER_APP_SECRET"],
        cluster=os.environ.get("PUSHER_CLUSTER", "mt1"),
    )


@app.post("/webhooks/pusher")
async def pusher_webhook(request: Request):
    # Raw body is required: the signature covers the exact bytes Pusher sent
    raw_body = await request.body()
    key = request.headers.get("x-pusher-key")
    signature = request.headers.get("x-pusher-signature")

    if not key or not signature:
        raise HTTPException(status_code=400, detail="Missing Pusher signature headers")

    # validate_webhook checks X-Pusher-Key, the HMAC-SHA256 hex digest of the body
    # and that time_ms is within 5 minutes of now. It returns the parsed body or None.
    payload = pusher_client().validate_webhook(
        key=key, signature=signature, body=raw_body
    )
    if payload is None:
        raise HTTPException(status_code=400, detail="Invalid signature")

    # With batch webhooks enabled, one request can carry many events
    for event in payload.get("events", []):
        name = event.get("name")
        if name == "channel_occupied":
            print(f"Channel occupied: {event['channel']}")
        elif name == "channel_vacated":
            print(f"Channel vacated: {event['channel']}")
        elif name == "member_added":
            print(f"Member {event['user_id']} joined {event['channel']}")
        elif name == "member_removed":
            print(f"Member {event['user_id']} left {event['channel']}")
        elif name == "client_event":
            print(f"Client event {event['event']} on {event['channel']} from {event['socket_id']}")
        elif name == "cache_miss":
            print(f"Cache miss on {event['channel']}")
        elif name == "subscription_count":
            print(f"Subscription count on {event['channel']}: {event['subscription_count']}")
        else:
            print(f"Unhandled Pusher event: {name}")

    return {"received": True}
