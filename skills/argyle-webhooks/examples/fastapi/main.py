# Generated with: argyle-webhooks skill
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

# Argyle's docs don't name the HTTP method, so accept all of these.
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

SIGNATURE_PATTERN = re.compile(r"[0-9a-fA-F]{128}")  # HMAC-SHA512 as hex = 128 characters


def verify_argyle_signature(raw_body: bytes, signature, secret=None) -> bool:
    """Argyle signs the raw request body with HMAC-SHA512, keyed with the subscription
    secret (UTF-8 bytes, used as-is), and sends the bare hex digest in X-Argyle-Signature.
    Nothing else is signed (no timestamp, no id), so there is no replay window to check.
    Hex is case-insensitive: validate the format, lowercase, compare in constant time.
    """
    secret = secret if secret is not None else os.environ.get("ARGYLE_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    if not isinstance(signature, str) or not SIGNATURE_PATTERN.fullmatch(signature):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
    # Both sides are bytes (compare_digest raises on non-ASCII str).
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))


def handle_event(payload: dict) -> None:
    event = payload.get("event")
    data = payload.get("data")
    data = data if isinstance(data, dict) else {}

    if event in ("accounts.added", "accounts.connected", "accounts.failed",
                 "accounts.removed", "accounts.updated"):
        print(f"Account event {event}: account {data.get('account')}, user {data.get('user')}")
        # TODO: update the connection state for data["account"]

    elif event in ("gigs.added", "gigs.updated", "gigs.removed",
                   "gigs.partially_synced", "gigs.fully_synced"):
        print(f"Gig event {event}: {json.dumps(data)}")
        # TODO: fetch the changed gigs by id from the Argyle API

    elif event in ("identities.added", "identities.updated"):
        print(f"Identity event {event}: {json.dumps(data)}")
        # TODO: fetch the identity by id and refresh your records

    elif event in ("items.updated", "items.removed"):
        print(f"Item event {event}: {json.dumps(data)}")
        # TODO: refresh your list of supported employers and platforms

    else:
        print(f"Unhandled event: {event}")


@app.api_route("/webhooks/argyle", methods=METHODS)
async def argyle_webhook(request: Request):
    # Raw bytes, exactly as received. A missing body is verified as zero bytes.
    raw_body = await request.body()
    signature = request.headers.get("x-argyle-signature")  # Starlette headers are case-insensitive

    # Verify first, for every method.
    if not verify_argyle_signature(raw_body, signature):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Argyle-Signature")

    # Verified. An empty body (e.g. GET) is acknowledged, not rejected as bad JSON.
    if not raw_body.strip():
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Argyle event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    # Answer 200 within 10 s. Deliveries can repeat: make handlers idempotent.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
