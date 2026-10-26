# Generated with: clemta-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Clemta Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """Clemta sends webhook-* headers; Hookdeck also reads svix-* when webhook-id is absent."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return (
        headers.get(f"{prefix}-id"),
        headers.get(f"{prefix}-timestamp"),
        headers.get(f"{prefix}-signature"),
    )


@app.post("/webhooks/clemta")
async def clemta_webhook(request: Request):
    secret = os.environ.get("CLEMTA_WEBHOOK_SECRET")
    if not secret:
        print("CLEMTA_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    msg_id, timestamp, signature = read_signature_headers(request.headers)
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Clemta signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, entry (v1a is skipped)
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        Webhook(secret).verify(
            raw_body,
            {
                "webhook-id": msg_id,
                "webhook-timestamp": timestamp,
                "webhook-signature": signature,
            },
        )
    except WebhookVerificationError as err:
        print(f"Clemta webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    # Parse only after the signature check
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Body is {type, data}; data.object is the resource, and its own `object` field names the kind
    event_type = event.get("type")
    data = event.get("data")
    resource = data.get("object") if isinstance(data, dict) else None
    if not isinstance(resource, dict):
        resource = {}
    # webhook-id is the event id, stable across retries: use it to deduplicate
    print(f"Received Clemta webhook {msg_id}: {event_type}")

    if event_type in (
        "company.created",
        "company.verified",
        "company.incorporated",
        "company.onboarding.completed",
        "company.updated",
        "company.entitlements.changed",
    ):
        print(f"{event_type}: {resource.get('id')}")
    elif event_type == "company.status.changed":
        # Branch on the company's status (in_progress, active, cancelled), not on this type
        print(f"Company status changed: {resource.get('id')} {resource.get('status')}")
    elif event_type == "company.name.changed":
        print(f"Company renamed: {resource.get('id')} {resource.get('name')}")
    elif event_type == "company.ein.assigned":
        print(f"EIN assigned: {resource.get('id')} {resource.get('ein')}")
    elif event_type == "company.document.received":
        print(f"Owner document received for company: {resource.get('id')}")
    elif event_type == "company.dissolved":
        # Terminal: recurring services stop renewing and open requirements close
        print(f"Company dissolved: {resource.get('id')}")
    elif event_type in ("tax_filing.created", "tax_filing.status.changed"):
        print(f"{event_type}: {resource.get('id')} {resource.get('status')} {resource.get('progress')}")
    elif event_type == "service_order.status.changed":
        # Fires on creation and on every fulfilment step, including cancellation: branch on status
        print(f"Service order status changed: {resource.get('id')} {resource.get('status')}")
    elif event_type == "service_order.completed":
        # Fires again if the order reopens and completes once more: handle repeats idempotently
        print(f"Service order completed: {resource.get('id')}")
    elif event_type in (
        "service_order.updated",
        "service_order.renewal_canceled",
        "service_order.renewal_cancel_denied",
    ):
        print(f"{event_type}: {resource.get('id')}")
    elif event_type == "service_order.quoted":
        # Accept before quote.expires_at; nothing bills until you do
        quote = resource.get("quote") or {}
        print(f"Service order quoted: {resource.get('id')} {quote.get('expires_at')}")
    elif event_type in ("requirement.created", "requirement.fulfilled"):
        print(f"{event_type}: {resource.get('id')}")
    elif event_type == "requirement.canceled":
        print(f"Requirement canceled: {resource.get('id')} {resource.get('cancel_reason')}")
    elif event_type in ("requirement.signature.viewed", "requirement.signature.signed"):
        # Once per signer; the requirement resolves with requirement.fulfilled when the last signer signs
        print(f"{event_type}: {resource.get('id')}")
    elif event_type == "file.created":
        # Download the bytes from the file's content endpoint
        print(f"File created: {resource.get('id')}")
    elif event_type == "calendar.reminder":
        # Once per reminder point; relay it under your own brand, Clemta sends no mail to your customer
        print(f"Calendar reminder: {resource.get('id')} {resource.get('due_at')} {resource.get('remind_at')}")
    elif event_type == "invoice.finalized":
        print(f"Invoice finalized: {resource.get('id')}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
