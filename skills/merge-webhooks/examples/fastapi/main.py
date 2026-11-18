# Generated with: merge-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Merge webhook receiver for FastAPI.

Merge signs every webhook with X-Merge-Webhook-Signature: the HMAC-SHA256 of
the raw body, encoded as base64url WITH '=' padding (44 characters). The key is
your organization's signature key (Configuration > Webhooks > Security), used
as UTF-8 text. Padding carries no data, so it's ignored on both sides.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import re
from typing import Any, Dict, Optional, Union

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("merge-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Merge Webhook Handler")


def verify_merge_signature(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    key: Optional[str],
) -> bool:
    """Verify X-Merge-Webhook-Signature against the exact bytes Merge sent."""
    secret = (key or "").strip()
    value = (signature or "").strip()
    # 32 bytes = 43 base64url characters, plus one optional '='.
    if not secret or not re.fullmatch(r"[A-Za-z0-9_-]{43}=?", value):
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.urlsafe_b64encode(digest).rstrip(b"=")
    return hmac.compare_digest(value.rstrip("=").encode("ascii"), expected)


def handle_event(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Every payload has hook.event. Most also have linked_account and data;
    AsyncPassthrough.resolved carries async_passthrough_receipt_id instead."""
    event = (payload.get("hook") or {}).get("event") or ""
    account = payload.get("linked_account") or {}
    if event == "LinkedAccount.deleted":
        logger.info("Linked account %s deleted: drop its data", account.get("id"))
    elif event.startswith("Issue."):
        logger.info("%s for linked account %s", event, account.get("id"))
    elif re.search(r"\.(added|changed|removed)$", event):
        logger.info("%s: %s", event, (payload.get("data") or {}).get("id"))
    else:
        logger.info("Merge event: %s", event)
    return {"received": True, "event": event, "linked_account_id": account.get("id")}


@app.post("/webhooks/merge")
async def merge_webhook(request: Request):
    key = os.environ.get("MERGE_WEBHOOK_SIGNATURE_KEY", "")
    if not key.strip():
        logger.error("MERGE_WEBHOOK_SIGNATURE_KEY is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_merge_signature(raw_body, request.headers.get("x-merge-webhook-signature"), key):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        payload = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    # Answer within Merge's 10-second timeout; do the real work in a background job.
    return handle_event(payload)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
