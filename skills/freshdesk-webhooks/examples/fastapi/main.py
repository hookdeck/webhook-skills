# Generated with: freshdesk-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Freshdesk automation webhook receiver.

Freshdesk webhooks are a "Trigger Webhook" action inside automation rules
(Admin -> Workflows -> Automations -> Ticket Creation / Ticket Updates).

1. They are NOT signed. There is no signature header, HMAC or timestamp.
   Authenticate them with a shared secret YOU add under "Add custom headers"
   (e.g. ``X-Freshdesk-Webhook-Secret: <hex>``) and compare it in constant time.
2. The body is whatever the admin wrote in the rule's Advanced content, with
   placeholders like {{ticket.id}}. Freshdesk defines no event-type strings, so
   each rule hard-codes an ``event`` field (this skill's convention).
"""

import hmac
import json
import logging
import os
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("freshdesk-webhooks")
logging.basicConfig(level=logging.INFO)

DEFAULT_HEADER = "X-Freshdesk-Webhook-Secret"

# The `event` values set in each rule's payload template.
TICKET_CREATED = "ticket_created"
TICKET_UPDATED = "ticket_updated"

app = FastAPI()


def verify_freshdesk_secret(header_value: str | None) -> bool:
    """Compare the shared secret from the custom header in constant time.

    Raises RuntimeError when FRESHDESK_WEBHOOK_SECRET is unset (fail closed).
    """
    expected = os.environ.get("FRESHDESK_WEBHOOK_SECRET")
    if not expected:
        raise RuntimeError("FRESHDESK_WEBHOOK_SECRET is not set")
    if header_value is None:
        return False
    return hmac.compare_digest(header_value.encode(), expected.encode())


async def require_freshdesk_secret(request: Request) -> None:
    """Dependency: check the shared-secret header before the body is read."""
    header_name = os.environ.get("FRESHDESK_WEBHOOK_HEADER") or DEFAULT_HEADER
    try:
        # Starlette headers are case-insensitive, matching Freshdesk's handling.
        ok = verify_freshdesk_secret(request.headers.get(header_name))
    except RuntimeError as err:
        logger.error("Freshdesk webhook misconfigured: %s", err)
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    if not ok:
        logger.error("Freshdesk webhook rejected: %s missing or wrong", header_name)
        raise HTTPException(status_code=401, detail="Invalid webhook secret")


def dedupe_key(payload: dict[str, Any]) -> str | None:
    """Freshdesk has no delivery ID and retries 48 times, so dedupe on body fields."""
    ticket = payload.get("ticket") or {}
    ticket_id = ticket.get("id") if isinstance(ticket, dict) else None
    if not ticket_id:
        return None
    return f"{payload.get('event')}:{ticket_id}:{ticket.get('status') or ''}"


async def handle_ticket_created(ticket: dict[str, Any]) -> None:
    # Placeholder values arrive as strings; coerce what you need.
    logger.info(
        "Ticket created: #%s %r from %s",
        ticket.get("id"),
        ticket.get("subject", ""),
        ticket.get("requester_email", "unknown"),
    )
    # TODO: create the record in your system. Re-fetch the ticket from
    # GET https://<domain>.freshdesk.com/api/v2/tickets/{id} before acting on it.


async def handle_ticket_updated(ticket: dict[str, Any]) -> None:
    logger.info(
        "Ticket updated: #%s status=%s priority=%s",
        ticket.get("id"),
        ticket.get("status", "n/a"),
        ticket.get("priority", "n/a"),
    )
    # TODO: sync the change, upserting on ticket["id"].


async def dispatch(payload: dict[str, Any]) -> bool:
    """Dispatch on the `event` field. Returns whether the event was recognised."""
    ticket = payload.get("ticket")
    if not isinstance(ticket, dict):
        ticket = {}
    event = payload.get("event")
    if event == TICKET_CREATED:
        await handle_ticket_created(ticket)
        return True
    if event == TICKET_UPDATED:
        await handle_ticket_updated(ticket)
        return True
    # Acknowledge unknown events so Freshdesk doesn't retry them 48 times.
    logger.warning("Unhandled Freshdesk event: %s", event)
    return False


@app.post("/webhooks/freshdesk", dependencies=[Depends(require_freshdesk_secret)])
async def freshdesk_webhook(request: Request):
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        # XML encoding, or a placeholder value that broke the JSON template.
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(payload, dict) or not isinstance(payload.get("event"), str):
        raise HTTPException(status_code=400, detail="Missing event field")

    logger.info(
        "Freshdesk webhook: event=%s triggered_event=%s key=%s",
        payload["event"],
        payload.get("triggered_event", "n/a"),
        dedupe_key(payload),
    )

    try:
        await dispatch(payload)
    except Exception as err:  # noqa: BLE001
        logger.error("Freshdesk webhook processing failed: %s", err)
        # Non-2xx makes Freshdesk retry every 30 minutes (48 calls in total).
        raise HTTPException(status_code=500, detail="Processing failed")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
