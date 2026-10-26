import hashlib
import hmac
import json
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

HEX_SHA1 = re.compile(r"[0-9a-fA-F]{40}")


def verify_simpro_signature(
    raw_body: bytes, signature: Optional[str], secret: Optional[str]
) -> bool:
    """Verify a Simpro webhook signature.

    X-Response-Signature = lowercase hex HMAC-SHA1 of the raw body, keyed with the
    subscription Secret. No prefix and no timestamp.
    """
    if not signature or not secret or not HEX_SHA1.fullmatch(signature):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature.lower(), expected)


def handle_simpro_event(event: dict) -> None:
    """Handle a Simpro event, dispatching on its `ID`.

    `reference` holds the ids needed to fetch the record from the Simpro API.
    """
    event_id = event.get("ID")
    description = event.get("description")
    reference = event.get("reference")

    if event_id == "job.created":
        print(f"Job created: {description}", reference)
        # TODO: Fetch the job via the Simpro API and sync it

    elif event_id == "company.customer.updated":
        print(f"Customer updated: {description}", reference)
        # TODO: Fetch the customer and update your CRM

    elif event_id == "invoice.created":
        print(f"Invoice created: {description}", reference)
        # TODO: Push to accounting

    elif event_id == "quote.updated":
        print(f"Quote updated: {description}", reference)
        # TODO: Track quote status

    elif event_id == "employee.deleted":
        print(f"Employee deleted: {description}", reference)
        # TODO: Revoke access in connected systems

    elif event_id == "test.updated":
        print("Simpro test subscription received")

    else:
        print(f"Unhandled Simpro event: {event_id}")


@app.post("/webhooks/simpro")
async def simpro_webhook(request: Request):
    secret = os.environ.get("SIMPRO_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("x-response-signature")
    if not signature:
        raise HTTPException(status_code=401, detail="Missing X-Response-Signature header")

    # Raw body for signature verification - don't parse JSON first
    raw_body = await request.body()
    if not verify_simpro_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    handle_simpro_event(event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
