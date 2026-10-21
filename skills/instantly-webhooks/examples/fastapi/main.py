# Generated with: instantly-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Instantly webhook receiver (FastAPI).

INSTANTLY WEBHOOK AUTHENTICATION

Instantly does NOT sign webhooks: no signature header, no HMAC, no timestamp
header. You attach custom HTTP headers to the webhook (UI: Integrations ->
Webhooks -> "Add headers", or the API v2 ``headers`` object), e.g.
``Authorization: Basic ...`` or ``X-Instantly-Secret: <random>``. Instantly
sends that header unchanged, so compare the WHOLE value, in constant time.
"""

import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI(title="Instantly Webhooks")


def header_name(env=None) -> str:
    """Header name to check. Starlette header lookups are case-insensitive."""
    env = os.environ if env is None else env
    return (env.get("INSTANTLY_WEBHOOK_HEADER") or "authorization").strip().lower()


def verify_instantly_header(received: str | None, expected: str | None) -> bool:
    """Constant-time compare of the received header value."""
    if not received or not expected:
        return False
    return hmac.compare_digest(received.encode("utf-8"), expected.encode("utf-8"))


def idempotency_key(payload: dict) -> str:
    """Instantly payloads have no event ID, so derive an idempotency key."""
    fields = ("event_type", "timestamp", "campaign_id", "lead_email", "step", "email_id")
    return ":".join("" if payload.get(f) is None else str(payload.get(f)) for f in fields)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/instantly")
async def instantly_webhook(request: Request):
    expected = os.getenv("INSTANTLY_WEBHOOK_SECRET")

    # Fail closed on misconfiguration: 500, so it's distinguishable from a bad credential.
    if not expected:
        print("INSTANTLY_WEBHOOK_SECRET is not set — refusing unauthenticated webhooks")
        return JSONResponse({"error": "Webhook authentication not configured"}, status_code=500)

    name = header_name()
    received = request.headers.get(name)
    if not received:
        return JSONResponse({"error": f"Missing {name} header"}, status_code=401)

    if not verify_instantly_header(received, expected):
        print(f"Instantly webhook {name} header mismatch")
        return JSONResponse({"error": f"Invalid {name} header"}, status_code=401)

    # Authenticate first, then parse the raw body.
    body = await request.body()
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(payload, dict):
        return JSONResponse({"error": "Invalid payload"}, status_code=400)

    print(f"✓ Authenticated Instantly webhook: {payload.get('event_type')} ({idempotency_key(payload)})")

    handle_event(payload)

    return {"received": True}


def handle_event(payload: dict) -> None:
    # TODO: check idempotency_key(payload) against your store and return if seen.
    event_type = payload.get("event_type")
    lead = payload.get("lead_email") or "unknown lead"
    campaign = payload.get("campaign_name") or payload.get("campaign_id")

    match event_type:
        # --- Email events ---------------------------------------------------
        case "email_sent":
            print(f"📤 Email sent to {lead} (campaign {campaign}, step {payload.get('step')})")
        case "email_opened":
            print(f"👀 {lead} opened an email")
        case "email_link_clicked" | "link_clicked":  # link_clicked: name in the events guide
            print(f"🔗 {lead} clicked a link")
        case "reply_received":
            print(f"💬 Reply from {lead}: {payload.get('reply_text_snippet', '')}")
        case "auto_reply_received":
            print(f"🤖 Auto-reply from {lead}")
        case "email_bounced":
            print(f"⛔ Email to {lead} bounced")
        case "lead_unsubscribed":
            print(f"🚫 {lead} unsubscribed — add to suppression list")
        case "account_error":
            print(f"⚠️  Sending account error: {payload.get('email_account')}")
        case "campaign_completed":
            print(f"🏁 Campaign completed: {campaign}")

        # --- Lead status events ---------------------------------------------
        case "lead_interested":
            print(f"🔥 {lead} is interested")
        case "lead_not_interested" | "lead_neutral" | "lead_closed" | "lead_out_of_office" | "lead_wrong_person":
            print(f"🏷️  {lead} status: {event_type}")
        case "lead_meeting_booked":
            print(f"📅 Meeting booked with {lead}")
        case "lead_meeting_completed" | "lead_no_show":
            print(f"📅 Meeting update for {lead}: {event_type}")

        case _:
            # Custom labels arrive with the label name as event_type, as-is.
            print(f"Custom label or unhandled Instantly event: {event_type}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
