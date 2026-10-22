# Generated with: acuity-scheduling-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import os
from urllib.parse import parse_qs

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Acuity signs webhooks with your account API key (no separate webhook secret)
API_KEY = os.environ.get("ACUITY_API_KEY", "")


def verify_acuity_signature(raw_body: bytes, signature: str | None, api_key: str) -> bool:
    """Verify an Acuity Scheduling webhook signature.

    Acuity sends the base64 HMAC-SHA256 of the raw request body, keyed with the
    account API key, in the ``X-Acuity-Signature`` header. There is no timestamp.
    """
    if not signature or not api_key:
        return False

    digest = hmac.new(api_key.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("ascii")

    # Timing-safe comparison
    return hmac.compare_digest(expected.encode(), signature.encode())


@app.post("/webhooks/acuity-scheduling")
async def acuity_webhook(request: Request):
    # Get the raw body for signature verification — do not parse the form first
    raw_body = await request.body()
    signature = request.headers.get("x-acuity-signature")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Acuity-Signature header")

    if not verify_acuity_signature(raw_body, signature, API_KEY):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Signature is valid — safe to parse the form-encoded body
    params = parse_qs(raw_body.decode("utf-8"))
    action = (params.get("action") or [None])[0]
    appointment_id = (params.get("id") or [None])[0]

    if action == "scheduled":
        print(f"Appointment scheduled: {appointment_id}")
        # TODO: Fetch the appointment by ID, create CRM record, send confirmation, etc.

    elif action == "rescheduled":
        print(f"Appointment rescheduled: {appointment_id}")
        # TODO: Update calendar entries, notify staff, etc.

    elif action == "canceled":
        print(f"Appointment canceled: {appointment_id}")
        # TODO: Free up capacity, trigger follow-up, update CRM, etc.

    elif action == "changed":
        print(f"Appointment changed: {appointment_id}")
        # TODO: Re-sync the appointment (catch-all; may duplicate the actions above)

    elif action == "order.completed":
        print(f"Order completed: {appointment_id}")
        # TODO: Fetch the order, provision package or gift certificate credit, etc.

    else:
        print(f"Unhandled action: {action}")

    # Return 2xx to acknowledge receipt (Acuity retries only on 500 or network errors)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
