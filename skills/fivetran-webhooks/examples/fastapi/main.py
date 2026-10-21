import os
import hmac
import hashlib
import json
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_fivetran_webhook(raw_body: bytes, signature_header: Optional[str], secret: Optional[str]) -> bool:
    """Verify Fivetran webhook signature: HMAC-SHA256 hex of the raw body.

    Fivetran's own example compares uppercase hex, so compare case-insensitively.
    """
    if not signature_header or not secret:
        return False

    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest().upper()

    # Use timing-safe comparison
    return hmac.compare_digest(signature_header.strip().upper(), expected)


@app.post("/webhooks/fivetran")
async def fivetran_webhook(request: Request):
    # Read at request time so the secret can be changed without a restart
    secret = os.environ.get("FIVETRAN_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Get the raw body for signature verification
    raw_body = await request.body()
    signature_header = request.headers.get("x-fivetran-signature-256")

    if not signature_header:
        raise HTTPException(status_code=400, detail="Missing X-Fivetran-Signature-256 header")

    if not verify_fivetran_webhook(raw_body, signature_header, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event type is in the body, not a header
    event = payload.get("event")
    connector_id = payload.get("connector_id")
    data = payload.get("data") or {}
    print(f"Received {event} event (connector: {connector_id})")

    if event == "sync_start":
        print(f"Sync started for {connector_id} (sync {payload.get('sync_id')})")
        # TODO: Mark pipeline as running

    elif event == "sync_end":
        print(f"Sync ended for {connector_id}: {data.get('status')}")
        # TODO: Trigger dbt/BI refresh when SUCCESSFUL, alert when FAILED

    elif event == "status":
        # Deprecated by Fivetran; prefer sync_start / sync_end
        print(f"Status event for {connector_id}")

    elif event == "transformation_start":
        print("Transformation run started")

    elif event == "transformation_succeeded":
        print("Transformation run succeeded")
        # TODO: Trigger downstream jobs

    elif event == "transformation_failed":
        print("Transformation run failed")
        # TODO: Alert on-call

    elif event == "connection_successful":
        print(f"Connection test passed for {connector_id}")

    elif event == "connection_failure":
        print(f"Connection test failed for {connector_id}")
        # TODO: Notify the connection owner

    else:
        print(f"Unhandled event: {event}")

    # Return 200 within 10 seconds to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
