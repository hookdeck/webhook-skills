import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_mailerlite_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify a MailerLite webhook signature.

    The Signature header is the bare hex HMAC-SHA256 of the raw body, keyed with
    the webhook's secret as a UTF-8 string. No prefix, no timestamp.
    """
    if not signature_header or not secret:
        return False

    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    # Timing-safe comparison (compare_digest needs ASCII str or bytes)
    return hmac.compare_digest(
        signature_header.strip().lower().encode("utf-8"),
        expected.encode("utf-8"),
    )


def handle_event(event: dict) -> None:
    # Flat payloads carry `event`; nested and batched payloads carry `type`
    name = event.get("event") or event.get("type")

    if name == "subscriber.created":
        print(f"New subscriber: {event.get('email')}")
    elif name == "subscriber.updated":
        print(f"Subscriber updated: {event.get('email')}")
    elif name == "subscriber.unsubscribed":
        print(f"Subscriber unsubscribed: {event.get('email')}")
    elif name == "subscriber.bounced":
        print(f"Subscriber bounced: {event.get('email')}")
    elif name == "subscriber.added_to_group":
        print(f"{(event.get('subscriber') or {}).get('email')} added to group {(event.get('group') or {}).get('name')}")
    elif name == "campaign.sent":
        print(f"Campaign sent: {event.get('name')} ({event.get('total_recipients')} recipients)")
    elif name in ("campaign.open", "campaign.click"):
        print(f"{name}: {(event.get('subscriber') or {}).get('email')} on {(event.get('campaign') or {}).get('name')}")
    else:
        print(f"Unhandled event: {name}")


@app.post("/webhooks/mailerlite")
async def mailerlite_webhook(request: Request):
    # Raw body for signature verification (works for any content type)
    raw_body = await request.body()
    signature_header = request.headers.get("signature")

    if not verify_mailerlite_webhook(raw_body, signature_header, os.environ.get("MAILERLITE_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Batchable webhooks deliver { "events": [...], "total": n }
    events = payload["events"] if isinstance(payload, dict) and isinstance(payload.get("events"), list) else [payload]
    for event in events:
        handle_event(event)

    # Respond 2xx within 3 seconds or MailerLite retries (10s, 100s, 1000s)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
