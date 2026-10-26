# Generated with: langfuse-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_langfuse_signature(
    raw_body: bytes,
    signature_header: Optional[str],
    secret: Optional[str] = None,
    tolerance_seconds: Optional[int] = None,
    now: Optional[float] = None,
) -> bool:
    """Verify the x-langfuse-signature header: `t=<timestamp>,v1=<hex>`.

    v1 = hex HMAC-SHA256(key = secret as UTF-8, message = `<t>.<raw body bytes>`).
    `t` is used exactly as it appears in the header (never parsed and re-formatted).
    Any v1= entry may match (key rotation); other keys such as v0 are ignored.
    """
    secret = secret if secret is not None else os.environ.get("LANGFUSE_WEBHOOK_SECRET")
    if tolerance_seconds is None:
        tolerance_seconds = int(os.environ.get("LANGFUSE_WEBHOOK_TOLERANCE_SECONDS") or 0)
    if not secret or not signature_header:
        return False

    timestamp = None
    candidates = []
    for part in signature_header.split(","):
        key, sep, value = part.partition("=")
        if not sep:
            continue
        key, value = key.strip(), value.strip()
        if key == "t" and timestamp is None:
            timestamp = value
        elif key == "v1":
            candidates.append(value)
    if not timestamp or not candidates:
        return False

    # Opt-in replay window (t is Unix seconds). Off by default.
    if tolerance_seconds > 0:
        if not re.fullmatch(r"\d+", timestamp):
            return False
        if abs((now if now is not None else time.time()) - int(timestamp)) > tolerance_seconds:
            return False

    # Signed message is built as bytes: `<t>.` + the raw body exactly as received.
    expected = hmac.new(
        secret.encode("utf-8"), timestamp.encode("utf-8") + b"." + raw_body, hashlib.sha256
    ).digest()

    ok = False
    for candidate in candidates:
        # Validate length and alphabet before decoding.
        if not HEX_SHA256.fullmatch(candidate):
            continue
        if hmac.compare_digest(bytes.fromhex(candidate), expected):  # bytes on both sides
            ok = True
    return ok


def handle_event(event: dict) -> None:
    action = event.get("action")
    prompt = _as_dict(event.get("prompt"))
    if action == "created":
        print(f"Prompt version created: {prompt.get('name')} v{prompt.get('version')}")
    elif action == "updated":
        # Fires twice for a label/tag move: once for the version gaining it, once for the version losing it.
        print(f"Prompt version updated: {prompt.get('name')} v{prompt.get('version')} {prompt.get('labels')}")
    elif action == "deleted":
        print(f"Prompt version deleted: {prompt.get('name')} v{prompt.get('version')}")
    else:
        print(f"Unhandled Langfuse action: {action}")


@app.post("/webhooks/langfuse")
async def langfuse_webhook(request: Request):
    signature = request.headers.get("x-langfuse-signature")
    if not signature:
        raise HTTPException(status_code=401, detail="Missing x-langfuse-signature header")

    # Raw bytes: verify before parsing.
    raw_body = await request.body()
    if not verify_langfuse_signature(raw_body, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    try:
        handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Langfuse event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
