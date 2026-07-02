# Generated with: workos-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# The WorkOS Node SDK is the recommended verifier for Node apps. For Python /
# FastAPI we verify manually, reproducing the exact algorithm WorkOS uses:
#   signature = HMAC_SHA256(f"{timestamp}.{raw_body}", secret)  -> hex digest
#   header    = "t=<ms timestamp>, v1=<signature>"
# The timestamp is in MILLISECONDS.
WEBHOOK_SECRET = os.environ.get("WORKOS_WEBHOOK_SECRET", "")

# Reject webhooks older than this (milliseconds). Matches the WorkOS SDK default.
TOLERANCE_MS = 180_000


def parse_signature_header(header: str):
    """Parse a `t=<ms>, v1=<hex>` WorkOS-Signature header."""
    parts = {}
    for piece in header.split(","):
        key, _, value = piece.strip().partition("=")
        if key and value:
            parts[key] = value
    return parts.get("t"), parts.get("v1")


def verify_signature(raw_body: bytes, header: str, secret: str,
                     tolerance_ms: int = TOLERANCE_MS) -> bool:
    """Verify a WorkOS webhook signature (timing-safe)."""
    timestamp, signature = parse_signature_header(header)
    if not timestamp or not signature:
        return False

    # Reject stale timestamps to prevent replay attacks (milliseconds!).
    try:
        if int(time.time() * 1000) - int(timestamp) > tolerance_ms:
            return False
    except ValueError:
        return False

    signed_content = f"{timestamp}.".encode("utf-8") + raw_body
    expected = hmac.new(
        secret.encode("utf-8"), signed_content, hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


@app.post("/webhooks/workos")
async def workos_webhook(request: Request):
    # Read the RAW body for signature verification — do not parse first.
    raw_body = await request.body()
    sig_header = request.headers.get("workos-signature")

    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing WorkOS-Signature header")

    if not verify_signature(raw_body, sig_header, WEBHOOK_SECRET):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Signature is valid — safe to parse the JSON now.
    import json

    event = json.loads(raw_body)
    event_type = event.get("event")
    data = event.get("data", {})

    if event_type == "dsync.user.created":
        print(f"Directory user created: {data.get('id')}")
        # TODO: Provision the user in your app

    elif event_type == "dsync.group.user_added":
        print(f"User added to directory group: {data.get('id')}")
        # TODO: Grant group-based permissions

    elif event_type == "connection.activated":
        print(f"SSO connection activated: {data.get('id')}")
        # TODO: Enable SSO login for the organization

    elif event_type == "user.created":
        print(f"User created: {data.get('id')}")
        # TODO: Create a local user record

    elif event_type == "session.created":
        print(f"Session created: {data.get('id')}")
        # TODO: Audit the login

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
