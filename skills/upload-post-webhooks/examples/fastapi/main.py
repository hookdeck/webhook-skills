import hashlib
import hmac
import json
import os
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

HEX_DIGEST = re.compile(r"[0-9a-fA-F]{64}")


def verify_upload_post_signature(
    raw_body: bytes, signature: str | None, timestamp: str | None, secret: str | None
) -> bool:
    """Upload-Post signs `<timestamp>.<raw body>` with HMAC-SHA256 (hex), sent as `sha256=<hex>`.

    The key is the whole webhook secret (including whsec_) used as-is. This is NOT
    Standard Webhooks: nothing is base64-decoded.
    """
    if not signature or not timestamp or not secret:
        return False

    digest = signature[len("sha256="):] if signature.startswith("sha256=") else signature
    # Validate length and alphabet before decoding
    if not HEX_DIGEST.fullmatch(digest):
        return False

    # Signed message as bytes: timestamp header (latin-1), ".", raw body bytes
    try:
        signed = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    except UnicodeEncodeError:
        return False
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(digest.lower()), expected)


def timestamp_within_tolerance(timestamp: str, tolerance_seconds: int) -> bool:
    """Opt-in replay window. Off by default: Hookdeck retries and replays keep the original timestamp."""
    if not tolerance_seconds:
        return True
    if not re.fullmatch(r"[0-9]+", timestamp):
        return False
    return abs(time.time() - int(timestamp)) <= tolerance_seconds


@app.post("/webhooks/upload-post")
async def upload_post_webhook(
    request: Request,
    x_upload_post_signature: str | None = Header(default=None),
    x_upload_post_timestamp: str | None = Header(default=None),
):
    # Raw bytes: the exact bytes are what was signed
    raw_body = await request.body()

    if not verify_upload_post_signature(
        raw_body, x_upload_post_signature, x_upload_post_timestamp, os.getenv("UPLOAD_POST_WEBHOOK_SECRET")
    ):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        tolerance = int(os.getenv("UPLOAD_POST_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0
    if not timestamp_within_tolerance(x_upload_post_timestamp, tolerance):
        raise HTTPException(status_code=401, detail="Timestamp outside tolerance")

    # Parse only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event")

    if event == "upload_completed":
        print(f"Upload completed for {payload.get('user_email')}")
    elif event == "social_account_connected":
        print(f"Account connected: {payload.get('platform')} {payload.get('account_name')}")
    elif event == "social_account_disconnected":
        print(f"Account disconnected: {payload.get('platform')} {payload.get('account_name')} ({payload.get('reason')})")
    elif event == "social_account_reauth_required":
        print(f"Reauth required: {payload.get('platform')} {payload.get('account_name')} ({payload.get('reason')})")
    elif event == "comment_received":
        comment = _as_dict(payload.get("comment"))
        post = _as_dict(payload.get("post"))
        print(f"Comment on {post.get('id')}: {comment.get('text')}")
    elif event == "dm_received":
        print(f"DM received on {payload.get('platform')}")
    else:
        print(f"Unhandled event: {event}")

    return {"received": True}
