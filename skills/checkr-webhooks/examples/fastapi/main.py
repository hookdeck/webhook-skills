# Generated with: checkr-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Checkr webhook receiver for FastAPI.

Checkr signs every webhook with X-Checkr-Signature: the lowercase hex
HMAC-SHA256 of the raw request body. Checkr issues no dedicated webhook secret.
The key is the OLDEST secret API key on a direct account, or the Partner app's
OAuth client secret. Accounts without an API key get a placeholder sentence
instead of a signature, which never verifies.
"""

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

logger = logging.getLogger("checkr-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Checkr Webhook Handler")


def verify_checkr_signature(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    key: Optional[str],
) -> bool:
    """Verify X-Checkr-Signature against the exact bytes Checkr sent."""
    secret = (key or "").strip()
    value = (signature or "").strip()
    if not secret or not re.fullmatch(r"[0-9a-fA-F]{64}", value):
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(value), expected)


def handle_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """data.object is the full object when include_object is on (always on for
    Partner apps), otherwise just id, object and uri. Checkr doesn't guarantee
    order: fetch the object when the order matters."""
    obj = (event.get("data") or {}).get("object") or {}
    event_type = event.get("type")
    if event_type == "report.completed":
        logger.info("Report %s completed: status=%s result=%s", obj.get("id"), obj.get("status"), obj.get("result"))
    elif event_type in ("candidate.created", "candidate.updated"):
        logger.info("%s: candidate %s", event_type, obj.get("id"))
    elif event_type in ("invitation.completed", "invitation.expired"):
        logger.info("%s: invitation %s", event_type, obj.get("id"))
    else:
        logger.info("Unhandled Checkr event: %s", event_type)
    return {"received": True, "type": event_type, "id": event.get("id")}


@app.post("/webhooks/checkr")
async def checkr_webhook(request: Request):
    key = os.environ.get("CHECKR_SIGNING_KEY", "")
    if not key.strip():
        logger.error("CHECKR_SIGNING_KEY is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body.
    raw_body = await request.body()
    if not verify_checkr_signature(raw_body, request.headers.get("x-checkr-signature"), key):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    # Any 2xx acknowledges the delivery; Checkr ignores the response body.
    return handle_event(event)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
