# Generated with: gorgias-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hmac
import json
import os
from typing import Optional
from urllib.parse import parse_qsl

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_gorgias_authorization(header: Optional[str], secret: Optional[str]) -> bool:
    """
    Gorgias HTTP integrations are NOT signed. You add a header to the
    integration yourself (here `Authorization: Bearer <GORGIAS_WEBHOOK_SECRET>`)
    and Gorgias sends it verbatim. Compare the WHOLE value in constant time.
    """
    if not header or not secret:
        return False
    return hmac.compare_digest(header.encode("utf-8"), f"Bearer {secret}".encode("utf-8"))


def require_gorgias_auth(authorization: Optional[str] = Header(default=None)) -> None:
    """FastAPI dependency: authenticate before the route reads the body."""
    secret = os.environ.get("GORGIAS_WEBHOOK_SECRET")

    # Fail closed on misconfiguration: 500, distinguishable from a bad credential.
    if not secret:
        print("Set GORGIAS_WEBHOOK_SECRET — refusing unauthenticated webhooks")
        raise HTTPException(status_code=500, detail="Webhook authentication not configured")

    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    if not verify_gorgias_authorization(authorization, secret):
        print("Gorgias webhook Authorization header mismatch")
        raise HTTPException(status_code=401, detail="Invalid Authorization header")


def parse_gorgias_body(raw_body: bytes, content_type: Optional[str]) -> dict:
    """
    Parse the rendered body template: application/json or
    application/x-www-form-urlencoded. An empty body parses to {}.
    Raises ValueError on invalid JSON.
    """
    text = raw_body.decode("utf-8")
    if not text.strip():
        return {}
    if content_type and "application/x-www-form-urlencoded" in content_type:
        return dict(parse_qsl(text, keep_blank_values=True))
    payload = json.loads(text)
    if not isinstance(payload, dict):
        raise ValueError("Expected a JSON object")
    return payload


def event_name(payload: dict, query_event: Optional[str]) -> str:
    """
    Gorgias doesn't say which trigger fired: read the trigger key you hard-coded
    in the template ("event": "ticket-created") or the URL (?event=...).
    """
    if isinstance(payload.get("event"), str):
        return payload["event"]
    return query_event or "unknown"


@app.get("/health")
async def health():
    return {"status": "ok"}


# Gorgias calls the URL with whichever method the integration is configured with.
@app.api_route(
    "/webhooks/gorgias",
    methods=["POST", "PUT", "PATCH", "DELETE"],
    dependencies=[Depends(require_gorgias_auth)],
)
async def gorgias_webhook(request: Request):
    try:
        payload = parse_gorgias_body(await request.body(), request.headers.get("content-type"))
    except ValueError:  # json.JSONDecodeError and UnicodeDecodeError are ValueErrors
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = event_name(payload, request.query_params.get("event"))
    print(f"✓ Authenticated Gorgias webhook: {event} (ticket {payload.get('ticket_id', 'n/a')})")

    # Gorgias times out after 5 seconds and never retries error responses:
    # acknowledge now, and move slow work to a queue.
    handle_event(event, payload)

    return {"received": True}


def handle_event(event: str, payload: dict) -> None:
    # No delivery ID: dedupe on event + ticket_id + updated_datetime if you need to.
    ticket_id = payload.get("ticket_id")
    if event == "ticket-created":
        print(f"🎫 Ticket created: #{ticket_id} \"{payload.get('subject')}\" from {payload.get('customer_email')}")
    elif event == "ticket-updated":
        print(f"✏️  Ticket updated: #{ticket_id} (status {payload.get('status')})")
    elif event == "ticket-message-created":
        print(f"💬 New message on ticket #{ticket_id}")
    elif event == "ticket-self-unsnoozed":
        print(f"⏰ Ticket unsnoozed: #{ticket_id}")
    elif event == "ticket-message-failed":
        print(f"⚠️  Message failed to send on ticket #{ticket_id}")
    elif event == "ticket-assignment-updated":
        print(f"👤 Ticket #{ticket_id} assigned to {payload.get('assignee_email') or 'nobody'}")
    elif event == "ticket-status-updated":
        print(f"🔄 Ticket #{ticket_id} status is now {payload.get('status')}")
    elif event == "ticket-handed-over":
        print(f"🤝 Ticket handed over: #{ticket_id}")
    else:
        print(f"Unhandled Gorgias event: {event}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
