# Generated with: marketo-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Marketo Smart Campaign webhook receiver.

Marketo webhooks are sent by the "Call Webhook" step in a Smart Campaign flow.

1. They are NOT signed. There is no signature header, HMAC or timestamp.
   Authenticate them with a shared secret YOU add through
   Webhook Actions > Set Custom Header (e.g. ``X-Webhook-Secret: <hex>``)
   and compare it in constant time.
2. The body is the Payload Template the admin wrote, with lead tokens like
   {{lead.Id}}. Marketo defines no event-type strings, so each webhook
   hard-codes an ``event`` field (this skill's convention).
"""

import hmac
import json
import logging
import os
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("marketo-webhooks")
logging.basicConfig(level=logging.INFO)

DEFAULT_HEADER = "X-Webhook-Secret"

# The `event` values set in each webhook's payload template.
LEAD_CREATED = "lead_created"
LEAD_UPDATED = "lead_updated"

app = FastAPI()


def verify_marketo_secret(header_value: str | None) -> bool:
    """Compare the shared secret from the custom header in constant time.

    Raises RuntimeError when MARKETO_WEBHOOK_SECRET is unset (fail closed).
    """
    expected = os.environ.get("MARKETO_WEBHOOK_SECRET")
    if not expected:
        raise RuntimeError("MARKETO_WEBHOOK_SECRET is not set")
    if header_value is None:
        return False
    return hmac.compare_digest(header_value.encode(), expected.encode())


async def require_marketo_secret(request: Request) -> None:
    """Dependency: check the shared-secret header before the body is read."""
    header_name = os.environ.get("MARKETO_WEBHOOK_HEADER") or DEFAULT_HEADER
    try:
        # Starlette headers are case-insensitive, as HTTP requires.
        ok = verify_marketo_secret(request.headers.get(header_name))
    except RuntimeError as err:
        logger.error("Marketo webhook misconfigured: %s", err)
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    if not ok:
        logger.error("Marketo webhook rejected: %s missing or wrong", header_name)
        raise HTTPException(status_code=401, detail="Invalid webhook secret")


def dedupe_key(payload: dict[str, Any]) -> str | None:
    """Marketo sends no delivery ID, so dedupe on fields from the payload template."""
    lead = payload.get("lead") or {}
    lead_id = lead.get("id") if isinstance(lead, dict) else None
    if not lead_id:
        return None
    return f"{payload.get('event')}:{lead_id}:{payload.get('campaign') or ''}"


async def handle_lead_created(lead: dict[str, Any]) -> None:
    logger.info(
        "Lead created: #%s %s (%s)",
        lead.get("id"),
        lead.get("email", "unknown"),
        lead.get("company", "no company"),
    )
    # TODO: create the record in your system. Upsert on lead["id"].


async def handle_lead_updated(lead: dict[str, Any]) -> None:
    logger.info("Lead updated: #%s %s", lead.get("id"), lead.get("email", "unknown"))
    # TODO: sync the change, upserting on lead["id"].


async def dispatch(payload: dict[str, Any]) -> bool:
    """Dispatch on the `event` field. Returns whether the event was recognised."""
    lead = payload.get("lead")
    if not isinstance(lead, dict):
        lead = {}
    event = payload.get("event")
    if event == LEAD_CREATED:
        await handle_lead_created(lead)
        return True
    if event == LEAD_UPDATED:
        await handle_lead_updated(lead)
        return True
    # Acknowledge unknown events with a 200.
    logger.warning("Unhandled Marketo event: %s", event)
    return False


@app.post("/webhooks/marketo", dependencies=[Depends(require_marketo_secret)])
async def marketo_webhook(request: Request):
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        # Form/Url encoding, or a token value that broke the JSON template.
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(payload, dict) or not isinstance(payload.get("event"), str):
        raise HTTPException(status_code=400, detail="Missing event field")

    logger.info(
        "Marketo webhook: event=%s campaign=%s key=%s",
        payload["event"],
        payload.get("campaign", "n/a"),
        dedupe_key(payload),
    )

    try:
        await dispatch(payload)
    except Exception as err:  # noqa: BLE001
        logger.error("Marketo webhook processing failed: %s", err)
        raise HTTPException(status_code=500, detail="Processing failed")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
