# Generated with: truework-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Receiver for Truework webhooks (order.completed, verification_request.state.change).

Truework does NOT sign the payload: no HMAC, no signature header. Each webhook
has an authentication token (Developer Settings > Webhooks) that Truework sends
raw in the X-Truework-Token header. Reject any request whose token doesn't
match, comparing in constant time.
"""
import hashlib
import hmac
import json
import logging
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("truework-webhooks")
app = FastAPI()

TOKEN_HEADER = "x-truework-token"


def safe_equal(a: Optional[str], b: str) -> bool:
    """Constant-time compare. Hash both sides first so the comparison doesn't
    reveal the token's length (same as the Node examples)."""
    if a is None:
        return False
    return hmac.compare_digest(hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest())


def verify_truework_token(header_value: Optional[str], token: Optional[str] = None) -> Optional[bool]:
    """Returns None when no token is configured, so the caller can fail closed."""
    if token is None:
        token = os.environ.get("TRUEWORK_WEBHOOK_TOKEN", "")
    if not token:
        return None
    return safe_equal(header_value, token)


async def require_truework_token(request: Request) -> None:
    """FastAPI dependency: authenticate before the body is parsed."""
    result = verify_truework_token(request.headers.get(TOKEN_HEADER))
    if result is None:
        logger.error("Truework webhook refused: TRUEWORK_WEBHOOK_TOKEN is not set")
        raise HTTPException(status_code=500, detail="Webhook authentication not configured")
    if not result:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Truework-Token")


def handle_truework_event(payload: Any) -> Optional[str]:
    """Handle one webhook. Payload shape:
    { version, hook: { id, event, target }, data: { order_id, ... } }
    Webhooks can be delivered more than once, so handlers must be idempotent."""
    hook = payload.get("hook") if isinstance(payload, dict) else None
    event = hook.get("event") if isinstance(hook, dict) else None
    data = payload.get("data") if isinstance(payload, dict) else None
    data = data if isinstance(data, dict) else {}

    if event == "order.completed":
        # All verifications on the order are completed or canceled: fetch results from the API.
        logger.info("Truework order completed: %s", data.get("order_id"))
    elif event == "verification_request.state.change":
        # state: pending-approval | processing | action-required | completed | canceled | invalid
        logger.info(
            "Truework verification request %s on order %s -> %s",
            data.get("verification_request_id"),
            data.get("order_id"),
            data.get("state"),
        )
    else:
        logger.info("Unhandled Truework event: %s", event)
    return event


@app.post("/webhooks/truework", dependencies=[Depends(require_truework_token)])
async def truework_webhook(request: Request):
    # Raw bytes regardless of content type; parsed only after auth passed.
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event = handle_truework_event(payload)
    return {"received": True, "event": event}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
