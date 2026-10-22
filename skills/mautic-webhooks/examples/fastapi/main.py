import os
import hmac
import hashlib
import base64
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_mautic_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify the Mautic Webhook-Signature header.

    Mautic sends base64(HMAC-SHA256(raw_body, secret)). Nothing else is signed.
    """
    if not signature_header or not secret:
        return False

    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")

    return hmac.compare_digest(signature_header, expected)


def handle_event(event_type: str, event: dict) -> None:
    if event_type == "mautic.lead_post_save_new":
        print(f"Contact identified: {(event.get('contact') or {}).get('id')}")
        # TODO: Sync new contact to CRM, etc.
    elif event_type == "mautic.lead_post_save_update":
        print(f"Contact updated: {(event.get('contact') or {}).get('id')}")
    elif event_type == "mautic.lead_post_delete":
        print(f"Contact deleted: {event.get('id')}")
    elif event_type == "mautic.lead_points_change":
        points = event.get("points") or {}
        print(f"Points changed: {points.get('old_points')} -> {points.get('new_points')}")
    elif event_type == "mautic.lead_channel_subscription_changed":
        print(f"Subscription changed: {event.get('channel')} {event.get('old_status')} -> {event.get('new_status')}")
    elif event_type == "mautic.lead_company_change":
        print("Contact added to company" if event.get("added") else "Contact removed from company")
    elif event_type == "mautic.company_post_save":
        print(f"Company saved: {(event.get('company') or {}).get('id')}")
    elif event_type == "mautic.company_post_delete":
        print(f"Company deleted: {event.get('id')}")
    elif event_type == "mautic.email_on_send":
        print(f"Email sent to contact: {(event.get('contact') or {}).get('id')}")
    elif event_type == "mautic.email_on_open":
        print(f"Email opened by contact: {(event.get('contact') or {}).get('id')}")
    elif event_type == "mautic.form_on_submit":
        print(f"Form submitted: {(event.get('submission') or {}).get('id')}")
        # TODO: Create a ticket, notify sales, etc.
    elif event_type == "mautic.page_on_hit":
        print(f"Page hit: {(event.get('hit') or {}).get('id')}")
    elif event_type == "mautic.sms_on_send":
        print(f"SMS sent: {event.get('smsId')}")
    else:
        print(f"Unhandled event type: {event_type}")


@app.post("/webhooks/mautic")
async def mautic_webhook(request: Request):
    # Raw bytes for signature verification, whatever the Content-Type
    raw_body = await request.body()
    signature = request.headers.get("webhook-signature")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing Webhook-Signature header")

    if not verify_mautic_webhook(raw_body, signature, os.environ.get("MAUTIC_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # The body is keyed by event type; each value is a list of events.
    # In queue mode one request can hold several types and several events per type.
    for event_type, events in payload.items():
        if not isinstance(events, list):
            continue
        for event in events:
            handle_event(event_type, event if isinstance(event, dict) else {})

    return {"status": "success"}


@app.get("/health")
async def health():
    return {"status": "ok"}
