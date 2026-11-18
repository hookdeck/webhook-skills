# Generated with: clockify-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Clockify webhook receiver for FastAPI.

Clockify doesn't sign webhook bodies. Every delivery carries the webhook's
token (the "Signing secret", authToken in the API) in Clockify-Signature,
unchanged on every request. Each webhook has its own token, so
CLOCKIFY_WEBHOOK_SIGNING_SECRET takes a comma-separated list when several
webhooks point at this endpoint.
"""

import hashlib
import hmac
import json
import logging
import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("clockify-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Clockify Webhook Handler")


def _safe_equal(given: str, expected: str) -> bool:
    """Constant-time string comparison that doesn't leak the length."""
    a = hashlib.sha256(given.encode("utf-8")).digest()
    b = hashlib.sha256(expected.encode("utf-8")).digest()
    return hmac.compare_digest(a, b)


def parse_tokens(value: Optional[str]) -> List[str]:
    """Split the configured value into tokens (JWTs contain no commas)."""
    return [token.strip() for token in (value or "").split(",") if token.strip()]


def verify_clockify_signature(signature: Optional[str], tokens: List[str]) -> bool:
    """Check Clockify-Signature against the configured webhook token(s)."""
    given = (signature or "").strip()
    if not given or not tokens:
        return False
    results = [_safe_equal(given, token) for token in tokens]  # check every token
    return any(results)


def handle_event(event_type: Optional[str], entity: Dict[str, Any]) -> Dict[str, Any]:
    """The body is the changed object itself (time entry, project, task, ...).
    One event per webhook; clockify-webhook-event-type names it when present."""
    logger.info("Clockify %s for %s", event_type or "event", entity.get("id"))
    return {"received": True, "event_type": event_type, "id": entity.get("id")}


@app.post("/webhooks/clockify")
async def clockify_webhook(request: Request):
    tokens = parse_tokens(os.environ.get("CLOCKIFY_WEBHOOK_SIGNING_SECRET"))
    if not tokens:
        logger.error("CLOCKIFY_WEBHOOK_SIGNING_SECRET is not set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    if not verify_clockify_signature(request.headers.get("clockify-signature"), tokens):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    raw_body = await request.body()
    try:
        entity = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(entity, dict):
        entity = {}

    return handle_event(request.headers.get("clockify-webhook-event-type"), entity)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
