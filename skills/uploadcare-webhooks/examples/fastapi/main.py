# Generated with: uploadcare-webhooks skill
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

_HEX64 = re.compile(r"[0-9a-f]{64}")


def verify_uploadcare_signature(raw_body: bytes, header, secret=None) -> bool:
    """Verify X-Uc-Signature: "v1=" + lowercase hex HMAC-SHA256(signing secret, raw body).

    Only the body is signed (no timestamp), so there is no replay window to check.
    """
    secret = secret if secret is not None else os.environ.get("UPLOADCARE_WEBHOOK_SECRET")
    if not secret or not header:
        return False
    sig = header.strip()
    if sig.lower().startswith("v1="):  # a bare digest is also accepted
        sig = sig[3:]
    sig = sig.lower()
    # Validate before decoding: exactly 64 hex characters.
    if not _HEX64.fullmatch(sig):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(expected, bytes.fromhex(sig))  # bytes, never str


def handle_event(payload: dict) -> None:
    hook = payload.get("hook")
    event = hook.get("event") if isinstance(hook, dict) else None
    data = payload.get("data")
    uuid = data.get("uuid") if isinstance(data, dict) else None

    if event == "file.uploaded":
        print(f"File uploaded: {uuid}")
        # TODO: save a record for payload["data"] / payload["file"] (CDN URL)
    elif event == "file.stored":
        print(f"File stored: {uuid}")
        # TODO: mark the upload as permanent
    elif event == "file.info_updated":
        print(f"File info updated: {uuid}")
        # TODO: sync data["metadata"] / data["appdata"] (v0.7); see payload["previous_values"]
    elif event == "file.infected":
        print(f"File infected: {uuid}")
        # TODO: quarantine or delete the file
    elif event == "file.deleted":
        print(f"File deleted: {uuid}")
        # TODO: remove your matching record
    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/uploadcare")
async def uploadcare_webhook(request: Request):
    # Read the exact bytes (any content type); verify before parsing.
    raw_body = await request.body()

    if not verify_uploadcare_signature(raw_body, request.headers.get("x-uc-signature")):
        raise HTTPException(status_code=401, detail="Invalid or missing signature")

    try:
        payload = json.loads(raw_body)
    except (UnicodeDecodeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as exc:  # noqa: BLE001
        print(f"Error handling Uploadcare event: {exc}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
