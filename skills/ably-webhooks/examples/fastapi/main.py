# Generated with: ably-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os

import msgpack
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Ably presence actions arrive as numbers in raw payloads
PRESENCE_ACTIONS = {0: "absent", 1: "present", 2: "enter", 3: "leave", 4: "update"}


def key_value_of(api_key: str):
    """The HMAC key is the keyValue: the part of "appId.keyId:keyValue" AFTER the ":".
    Using the whole API key as the HMAC key is the most common cause of failures."""
    _, sep, value = (api_key or "").partition(":")
    return value if sep and value else None


def key_matches(header_key, api_key: str) -> bool:
    """X-Ably-Key names the API key that signed the request ("appId.keyId")."""
    if not header_key:
        return True
    key_id = api_key.partition(":")[0]
    return header_key in (key_id, key_id.split(".")[-1])


def verify_ably_signature(raw_body: bytes, signature: str, api_key: str) -> bool:
    key_value = key_value_of(api_key)
    if not key_value or not signature:
        return False
    digest = hmac.new(key_value.encode(), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(signature, expected)


def extract_events(headers, raw_body: bytes) -> list:
    """Flatten non-enveloped, enveloped and batched (items[]) requests into events."""
    envelope_source = headers.get("x-ably-envelope-source")
    if envelope_source:
        # Non-enveloped: metadata is in unsigned x-ably-envelope-* headers, body is the raw data
        return [{
            "source": envelope_source,
            "channel": headers.get("x-ably-envelope-channel"),
            "name": headers.get("x-ably-message-name"),
            "data": raw_body.decode("utf-8", errors="replace"),
        }]

    if "msgpack" in headers.get("content-type", ""):
        payload = msgpack.unpackb(raw_body, raw=False)
    else:
        payload = json.loads(raw_body)

    if isinstance(payload.get("items"), list):
        return [
            {
                "source": item.get("source"),
                "name": item.get("name"),
                "channel": (item.get("data") or {}).get("channelId"),
                "messages": (item.get("data") or {}).get("messages"),
                "presence": (item.get("data") or {}).get("presence"),
            }
            for item in payload["items"]
        ]
    return [{
        "source": payload.get("source"),
        "name": payload.get("name"),
        "channel": payload.get("channel"),
        "messages": payload.get("messages"),
        "presence": payload.get("presence"),
    }]


def handle_event(event: dict) -> None:
    source = event.get("source")
    channel = event.get("channel")
    if source == "channel.message":
        for m in event.get("messages") or []:
            print(f'Message "{m.get("name")}" on {channel} from {m.get("clientId") or "unknown"}')
        if "data" in event:
            print(f'Message "{event.get("name")}" on {channel}')
    elif source == "channel.presence":
        for p in event.get("presence") or []:
            action = PRESENCE_ACTIONS.get(p.get("action"), p.get("action"))
            print(f'Presence {action}: {p.get("clientId")} on {channel}')
        if "data" in event:
            print(f'Presence {event.get("name")} on {channel}')
    elif source == "channel.lifecycle":
        # name is channel.opened or channel.closed
        print(f'Channel lifecycle {event.get("name")} on {channel}')
    elif source == "channel.occupancy":
        print(f"Occupancy changed on {channel}")
    else:
        print(f"Unhandled Ably source: {source}")


@app.post("/webhooks/ably")
async def ably_webhook(request: Request):
    api_key = os.environ.get("ABLY_API_KEY", "")
    if not key_value_of(api_key):
        raise HTTPException(
            status_code=500,
            detail="ABLY_API_KEY must be a full Ably API key (appId.keyId:keyValue)",
        )

    # Raw bytes are required: the signature covers the exact body Ably sent, in any encoding
    raw_body = await request.body()

    # Signing is opt-in on the rule ("Sign with key"); this handler requires it
    signature = request.headers.get("x-ably-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Ably-Signature header")
    if not key_matches(request.headers.get("x-ably-key"), api_key):
        raise HTTPException(status_code=400, detail="Signed with a different API key")
    if not verify_ably_signature(raw_body, signature, api_key):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        events = extract_events(request.headers, raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    for event in events:
        handle_event(event)
    return {"received": True}
