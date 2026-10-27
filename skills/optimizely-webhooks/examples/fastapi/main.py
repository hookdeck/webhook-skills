# Generated with: optimizely-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

_SHA1_HEX = re.compile(r"[0-9a-fA-F]{40}")


def verify_optimizely_signature(
    raw_body: bytes, header: Optional[str], secret: Optional[str]
) -> bool:
    """Verify X-Hub-Signature: sha1=<hex>.

    The signature is the hex HMAC-SHA1 of the raw body keyed with the webhook's
    secret token. Only the body is signed (no timestamp).
    """
    if not header or not secret:
        return False
    sig = header[len("sha1="):] if header.startswith("sha1=") else header
    # Validate before decoding so bytes.fromhex never sees junk
    if not _SHA1_HEX.fullmatch(sig):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).digest()
    return hmac.compare_digest(bytes.fromhex(sig), expected)


def handle_event(payload: dict) -> None:
    event = payload.get("event")
    data = payload.get("data")
    if event == "project.datafile_updated":
        data = data if isinstance(data, dict) else {}
        print(f"Datafile updated for {data.get('environment')} (revision {data.get('revision')})")
        # TODO: re-fetch the datafile from data["cdn_url"]
    elif event == "project.ruleset_updated":
        for change in data if isinstance(data, list) else []:
            entity = _as_dict(change.get("entity"))
            print(f"Ruleset change: {change.get('change_type')} on {entity.get('type')}")
        # TODO: audit log, notify your team
    else:
        print(f"Unhandled Optimizely event: {event}")


@app.post("/webhooks/optimizely")
async def optimizely_webhook(request: Request):
    secret = os.getenv("OPTIMIZELY_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes for signature verification - don't parse JSON first
    raw_body = await request.body()
    if not verify_optimizely_signature(raw_body, request.headers.get("x-hub-signature"), secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    handle_event(payload)
    return {"received": True}
