import os
import base64
import hmac
import hashlib
import json
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_census_webhook(raw_body: bytes, signature_header: Optional[str], secret: Optional[str]) -> bool:
    """Verify a Census (Fivetran Activations) webhook signature.

    X-Signature is the standard base64 HMAC-SHA256 of the raw body, keyed with the
    secret shown once when the webhook was created.
    """
    if not signature_header or not secret:
        return False

    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode()

    # Use timing-safe comparison
    return hmac.compare_digest(signature_header.strip().encode(), expected.encode())


@app.post("/webhooks/census")
async def census_webhook(request: Request):
    # Read at request time so the secret can be changed without a restart
    secret = os.environ.get("CENSUS_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes for signature verification, whatever the Content-Type
    raw_body = await request.body()
    signature_header = request.headers.get("x-signature")

    if not signature_header:
        raise HTTPException(status_code=400, detail="Missing X-Signature header")

    if not verify_census_webhook(raw_body, signature_header, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload after verification
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event type is in the body (`event`), not a header
    event = payload.get("event")
    sync_id = payload.get("sync_id")
    sync_run_id = payload.get("sync_run_id")
    print(f"Received {event} event (sync {sync_id}, run {sync_run_id})")

    if event == "sync.triggered":
        print(f"Sync run {sync_run_id} queued")
    elif event == "sync.started":
        print(f"Sync run {sync_run_id} started")
        # TODO: Mark the run as in progress
    elif event == "sync.completed":
        # Fires for successful and failed runs: status is "ok" or "emergency"
        print(f"Sync run {sync_run_id} completed with status {payload.get('status')}")
    elif event == "sync.success":
        print(f"Sync run {sync_run_id} succeeded")
        # TODO: Kick off downstream jobs that depend on the synced data
    elif event == "sync.failed":
        print(f"Sync run {sync_run_id} failed")
        # TODO: Page on-call or open a ticket
    elif event == "sync.alert.raised":
        print(f"Alert raised ({payload.get('alert_type')}): {payload.get('message')} - {payload.get('details')}")
        # TODO: Route to your alerting tool; followup_url links to the sync history
    elif event == "sync.alert.resolved":
        print(f"Alert resolved ({payload.get('alert_type')}): {payload.get('message')}")
    else:
        print(f"Unhandled event: {event}")

    # Return 200 to acknowledge receipt
    return {"status": "success"}


@app.get("/health")
async def health():
    return {"status": "ok"}
