# Generated with: appsflyer-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""AppsFlyer Push API webhook receiver.

APPSFLYER PUSH API AUTHENTICATION

AppsFlyer does NOT sign payloads: no signature header, no HMAC, no timestamp.
You configure a custom authorization header (name + token) per app ID, and
AppsFlyer sends it on every request. Compare the full value in constant time.
"""

import hmac
import json
import os
from typing import Any, Mapping, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI(title="AppsFlyer Webhook Receiver")


def header_name(env: Mapping[str, str] = os.environ) -> str:
    """Name of the header you configured in AppsFlyer (case-insensitive)."""
    return (env.get("APPSFLYER_AUTH_HEADER_NAME") or "authorization").lower()


def verify_appsflyer_token(received: Optional[str], expected: Optional[str]) -> bool:
    """Constant-time compare of the received header value to the expected token."""
    if not received or not expected:
        return False
    return hmac.compare_digest(received.encode("utf-8"), expected.encode("utf-8"))


def event_name(payload: Any) -> str:
    """The AppsFlyer event name lives in the record's `event_name` field."""
    if isinstance(payload, dict) and isinstance(payload.get("event_name"), str):
        return payload["event_name"]
    return "unknown"


def idempotency_key(payload: Any) -> str:
    """No unique event ID exists: build a key from the record."""
    p = payload if isinstance(payload, dict) else {}
    return "|".join(str(p.get(k)) for k in ("appsflyer_id", "event_name", "event_time"))


async def require_appsflyer_auth(request: Request) -> None:
    """FastAPI dependency: authenticate the AppsFlyer authorization header."""
    expected = os.environ.get("APPSFLYER_AUTH_TOKEN")
    if not expected:
        # Fail closed on misconfiguration: 500, distinguishable from a bad credential.
        print("APPSFLYER_AUTH_TOKEN is not set - refusing unauthenticated webhooks")
        raise HTTPException(status_code=500, detail="Webhook authentication not configured")

    received = request.headers.get(header_name())
    if not received:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    if not verify_appsflyer_token(received, expected):
        raise HTTPException(status_code=401, detail="Invalid authorization header")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/appsflyer", dependencies=[Depends(require_appsflyer_auth)])
async def appsflyer_webhook(request: Request):
    # Authentication already ran (dependency), so parse the body now.
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    print(f"Authenticated AppsFlyer record: {event_name(payload)}")
    handle_event(payload)
    return {"received": True}


def handle_event(payload: Any) -> None:
    # TODO: check idempotency_key(payload) against your store and return if seen.
    name = event_name(payload)
    appsflyer_id = payload.get("appsflyer_id") if isinstance(payload, dict) else None
    if name == "install":
        print(f"Install {appsflyer_id} for app {payload.get('app_id')}")
    elif name == "af_purchase":
        print(f"Purchase from {appsflyer_id} at {payload.get('event_time')}")
    elif name == "af_complete_registration":
        print(f"Registration from {appsflyer_id}")
    else:
        # In-app event names are defined by your app.
        print(f"In-app event {name} from {appsflyer_id}")
