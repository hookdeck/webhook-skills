# Generated with: logto-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

HEX_DIGEST = re.compile(r"[0-9a-fA-F]{64}")


def verify_logto_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Logto sends the bare hex HMAC-SHA256 of the raw body in logto-signature-sha-256.

    Nothing else is signed (no timestamp), so there is no replay window to check.
    """
    if not signature_header or not secret:
        return False
    # Validate the format before decoding
    if not HEX_DIGEST.fullmatch(signature_header):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature_header), expected)


def _str(value):
    return value if isinstance(value, str) else None


def user_id_of(body: dict):
    """Parsed fields are untrusted: check types before reading into them."""
    if isinstance(body.get("userId"), str):
        return body["userId"]
    user = body.get("user")
    return _str(user.get("id")) if isinstance(user, dict) else None


def data_id_of(body: dict):
    data = body.get("data")
    return _str(data.get("id")) if isinstance(data, dict) else None


@app.post("/webhooks/logto")
async def logto_webhook(request: Request):
    secret = os.getenv("LOGTO_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw body: read bytes before any JSON parsing
    raw_body = await request.body()
    signature = request.headers.get("logto-signature-sha-256")
    if not verify_logto_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(body, dict) or not isinstance(body.get("event"), str):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Dispatch on the top-level `event`; interactionEvent is not the event name
    event = body["event"]
    if event == "PostRegister":
        print(f"User registered: {user_id_of(body)}")
    elif event == "PostSignIn":
        application = body.get("application")
        app_name = _str(application.get("name")) if isinstance(application, dict) else None
        print(f"User signed in: {user_id_of(body)} (app {app_name})")
    elif event == "PostResetPassword":
        print(f"Password reset for user {user_id_of(body)}")
    elif event == "User.Created":
        print(f"User created: {data_id_of(body)}")
    elif event == "User.Data.Updated":
        print(f"User updated: {data_id_of(body)}")
    elif event == "User.Deleted":  # data is null
        print("User deleted")
    elif event == "User.SuspensionStatus.Updated":
        print(f"User suspension status changed: {data_id_of(body)}")
    elif event == "Grant.LimitExceeded":
        revoked = body.get("revokedGrantIds")
        count = len(revoked) if isinstance(revoked, list) else 0
        print(f"Grant limit exceeded for user {user_id_of(body)}, revoked {count} grant(s)")
    else:
        print(f"Unhandled Logto event: {event}")

    return {"received": True}
