# Generated with: cal-com-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_cal_com_webhook(
    raw_body: bytes, signature_header: Optional[str], secret: Optional[str]
) -> bool:
    """Verify a Cal.com webhook signature.

    Cal.com sends ``x-cal-signature-256`` = lowercase hex HMAC-SHA256 of the raw
    body, keyed on the webhook's secret. Webhooks without a secret send the
    literal "no-secret-provided", which fails this check.
    """
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.encode(), expected.encode())


@app.post("/webhooks/cal-com")
async def cal_com_webhook(request: Request):
    secret = os.environ.get("CALCOM_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Read the raw body BEFORE parsing — the signature is over the exact bytes.
    raw_body = await request.body()
    signature = request.headers.get("x-cal-signature-256")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing signature header")
    if not verify_cal_com_webhook(raw_body, signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # MEETING_STARTED / MEETING_ENDED use a flat payload (no `payload` wrapper)
    data = event.get("payload") or event
    trigger = event.get("triggerEvent")
    version = request.headers.get("x-cal-webhook-version")
    print(f"Received {trigger} (version {version})")

    if trigger == "BOOKING_CREATED":
        print(f"Booking created: {data.get('uid')} \"{data.get('title')}\" at {data.get('startTime')}")
        # TODO: Create CRM record, send custom confirmation, etc.

    elif trigger == "BOOKING_REQUESTED":
        print(f"Booking requested (awaiting confirmation): {data.get('uid')}")

    elif trigger == "BOOKING_RESCHEDULED":
        print(f"Booking rescheduled: {data.get('rescheduleUid')} -> {data.get('uid')} at {data.get('startTime')}")
        # TODO: Update calendar / CRM with the new time

    elif trigger == "BOOKING_CANCELLED":
        print(f"Booking cancelled: {data.get('uid')} ({data.get('cancellationReason') or 'no reason'})")
        # TODO: Release resources, issue refunds, etc.

    elif trigger == "BOOKING_REJECTED":
        print(f"Booking rejected: {data.get('uid')} ({data.get('rejectionReason') or 'no reason'})")

    elif trigger == "BOOKING_PAID":
        print(f"Booking paid: {data.get('uid')} (payment {data.get('paymentId')})")
        # TODO: Mark order as paid

    elif trigger == "MEETING_STARTED":
        print(f"Meeting started: {data.get('uid')}")

    elif trigger == "MEETING_ENDED":
        print(f"Meeting ended: {data.get('uid')}")
        # TODO: Send follow-up email, survey, invoice

    elif trigger == "RECORDING_READY":
        print(f"Recording ready for: {data.get('title')}")

    elif trigger == "FORM_SUBMITTED":
        print(f"Routing form submitted: {data.get('formName')} ({data.get('formId')})")

    else:
        print(f"Unhandled event: {trigger}")

    # Acknowledge quickly; do slow work asynchronously
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
