# Generated with: autotask-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import base64
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_autotask_webhook(raw_body: bytes, header: str, secret: str) -> bool:
    """Verify an Autotask webhook signature.

    Autotask sends `X-Hook-Signature: sha1=<base64>` where the value is
    base64(HMAC_SHA1(secret_key, raw_body)). Keep the base64 `=` padding.
    """
    if not header or not header.startswith("sha1="):
        return False
    received = header[len("sha1="):]
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).digest()
    ).decode("ascii")
    # Compare bytes (not str) so a non-ASCII header returns False instead of raising
    return hmac.compare_digest(expected.encode("utf-8"), received.encode("utf-8"))


@app.post("/webhooks/autotask")
async def autotask_webhook(request: Request):
    secret = os.environ.get("AUTOTASK_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Read the raw body BEFORE parsing so the signature matches exactly
    raw_body = await request.body()
    signature = request.headers.get("x-hook-signature")

    # Verify before trusting anything in the payload
    if not signature or not verify_autotask_webhook(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Payload: { Action, Guid, EntityType, Id, Fields, EventTime, SequenceNumber, PersonID }
    action = payload.get("Action")
    entity_type = payload.get("EntityType")
    entity_id = payload.get("Id")
    fields = payload.get("Fields")
    print(f"Received Autotask webhook: {entity_type} {action}")

    # Each webhook belongs to one entity (CompanyWebhooks, TicketWebhooks, ...), so
    # give each entity its own webhook URL and route on Action. Autotask's sample
    # shows EntityType "Account" for a company webhook; other values aren't printed.
    if action == "Create":
        print(f"{entity_type} created: {entity_id} {fields}")
        # Add the new record to your system
    elif action == "Update":
        # Fields holds only the subscribed fields that changed
        print(f"{entity_type} updated: {entity_id} {fields}")
    elif action == "Delete":
        print(f"{entity_type} deleted: {entity_id}")
    elif action == "Deactivated":
        # Sent to the DeactivationUrl: the webhook has stopped sending callouts
        print(f"Webhook deactivated: {payload.get('Guid')}")
    else:
        print(f"Unhandled Autotask callout: {entity_type} {action}")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
