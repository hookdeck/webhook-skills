# Generated with: pubnub-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

SCHEMA_PREFIX = "pubnub.com/schemas/events/"


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_pubnub_request(headers, secret=None, header_name=None) -> bool:
    """PubNub does not sign webhooks. You add a secret custom header to the Webhook
    action; its name is yours to choose (PUBNUB_WEBHOOK_HEADER, default 'Authorization')
    and the expected value is the WHOLE header value (PUBNUB_WEBHOOK_SECRET), including
    any 'Bearer ' prefix you typed. Nothing is stripped or parsed. Starlette's header
    lookup is case-insensitive.
    """
    secret = secret if secret is not None else os.environ.get("PUBNUB_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    header_name = header_name or os.environ.get("PUBNUB_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)
    return bool(received) and safe_equal(received, secret)


def event_type_from_schema(data_schema):
    """'pubnub.com/schemas/events/user.created?v=1.0.0' -> 'user.created'"""
    if not isinstance(data_schema, str):
        return None
    without_version = data_schema.split("?")[0]
    if not without_version.startswith(SCHEMA_PREFIX):
        return None
    return without_version[len(SCHEMA_PREFIX):]


async def require_pubnub_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_pubnub_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_item(event_type: str, item: dict) -> None:
    """Each item in payload["data"] is one event of the type named by payload["dataSchema"]."""
    get = item.get

    if event_type == "messages.pubsub.publish":
        # Also used for File sent: those items carry fileId and fileName.
        print(f"Message on {get('channel')} from {get('senderId')}")
        # TODO: process item["message"] (item["timetoken"] is the dedupe key)

    elif event_type == "messages.action.created":
        print(f"Message action added on {get('channel')} by {get('userId')}")

    elif event_type == "messages.action.deleted":
        print(f"Message action removed on {get('channel')} by {get('userId')}")

    elif event_type == "presence.user.channel.joined":
        print(f"{get('userId')} joined {get('channel')} (occupancy {get('occupancy')})")

    elif event_type == "presence.user.channel.left":
        print(f"{get('userId')} left {get('channel')} (occupancy {get('occupancy')})")

    elif event_type == "presence.user.timedout.in.channel":
        print(f"{get('userId')} timed out in {get('channelId')}")

    elif event_type == "presence.channel.user.state.in.changed":
        print(f"{get('userId')} changed state in {get('channel')}")

    elif event_type == "presence.channel.state.active":
        print(f"First user subscribed to {get('channel')}")

    elif event_type == "presence.channel.state.inactive":
        print(f"Last user left {get('channel')}")

    elif event_type == "presence.channel.occupancy.counted":
        print(f"Occupancy of {get('channel')}: {get('occupancy')}")

    elif event_type == "user.created":
        print(f"User created: {get('userId')}")
        # TODO: provision the user in your system

    elif event_type == "user.updated":
        print(f"User updated: {get('userId')}")

    elif event_type == "user.deleted":
        print(f"User deleted: {get('userId')}")

    elif event_type == "channel.created":
        print(f"Channel created: {get('channelId')}")

    elif event_type == "channel.updated":
        print(f"Channel updated: {get('channelId')}")

    elif event_type == "channel.deleted":
        print(f"Channel deleted: {get('channelId')}")

    elif event_type == "membership.created":
        print(f"Membership created: {get('userId')} in {get('channelId')}")

    elif event_type == "membership.updated":
        print(f"Membership updated: {get('userId')} in {get('channelId')}")

    elif event_type == "membership.deleted":
        print(f"Membership deleted: {get('userId')} in {get('channelId')}")

    elif event_type == "push.device.removed":
        print(f"Push device removed: {get('device')}")

    elif event_type == "push.message.sending.failed":
        print(f"Push failed on {get('channel')}: {get('payload')}")

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/pubnub", dependencies=[Depends(require_pubnub_secret)])
async def pubnub_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event_type = event_type_from_schema(payload.get("dataSchema")) if isinstance(payload, dict) else None
    if not event_type or not isinstance(payload.get("data"), list):
        raise HTTPException(
            status_code=400, detail="Expected a No Envelope payload with dataSchema and data"
        )

    try:
        for item in payload["data"]:
            handle_item(event_type, item if isinstance(item, dict) else {})
    except Exception as err:  # noqa: BLE001
        print(f"Error handling PubNub event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
