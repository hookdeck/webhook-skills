# Generated with: quickbooks-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()

# Legacy eventNotifications operations -> CloudEvents event names
LEGACY_OPERATIONS = {
    "Create": "created",
    "Update": "updated",
    "Delete": "deleted",
    "Merge": "merged",
    "Void": "voided",
    "Emailed": "emailed",
}


def verify_quickbooks_signature(
    raw_body: bytes, signature: Optional[str], verifier_token: Optional[str]
) -> bool:
    """Verify base64(HMAC-SHA256(raw_body, verifier_token)) against the intuit-signature header."""
    if not signature or not verifier_token:
        return False
    expected = base64.b64encode(
        hmac.new(verifier_token.encode("utf-8"), raw_body, hashlib.sha256).digest()
    )
    # Compare bytes: compare_digest raises TypeError on non-ASCII str input
    return hmac.compare_digest(signature.encode("utf-8"), expected)


def normalize_events(payload: Any) -> Optional[list[dict]]:
    """
    Normalize both payload shapes into a flat list of events:
    - CloudEvents (current): top-level list, type = "qbo.{entity}.{event}.v1"
    - Legacy: {"eventNotifications": [{"realmId", "dataChangeEvent": {"entities": [...]}}]}
    """
    if isinstance(payload, list):
        events = []
        for event in payload:
            parts = str(event.get("type", "")).split(".")
            events.append(
                {
                    "id": event.get("id"),
                    "type": event.get("type"),
                    "entity": parts[1] if len(parts) > 1 else "",
                    "action": parts[2] if len(parts) > 2 else "",
                    "entity_id": event.get("intuitentityid"),
                    "realm_id": event.get("intuitaccountid"),
                    "time": event.get("time"),
                    "data": event.get("data") or {},
                }
            )
        return events

    if isinstance(payload, dict) and isinstance(payload.get("eventNotifications"), list):
        events = []
        for notification in payload["eventNotifications"]:
            realm_id = notification.get("realmId")
            entities = (notification.get("dataChangeEvent") or {}).get("entities") or []
            for entity in entities:
                name = str(entity.get("name", "")).lower()
                operation = entity.get("operation", "")
                action = LEGACY_OPERATIONS.get(operation, str(operation).lower())
                events.append(
                    {
                        "id": f"{realm_id}-{entity.get('name')}-{entity.get('id')}-{entity.get('lastUpdated')}",
                        "type": f"qbo.{name}.{action}.v1",
                        "entity": name,
                        "action": action,
                        "entity_id": entity.get("id"),
                        "realm_id": realm_id,
                        "time": entity.get("lastUpdated"),
                        "data": {"deletedid": entity["deletedId"]} if entity.get("deletedId") else {},
                    }
                )
        return events

    return None


def handle_event(event: dict) -> None:
    label = f"{event['entity']} {event['entity_id']} (realm {event['realm_id']})"
    action = event["action"]

    if action == "created":
        print(f"Created: {label}")
        # TODO: Fetch the record from the Accounting API and sync it
    elif action == "updated":
        print(f"Updated: {label}")
        # TODO: Re-fetch the record and update your copy
    elif action == "deleted":
        print(f"Deleted: {label}")
        # TODO: Remove or archive your copy
    elif action == "merged":
        print(f"Merged: {label}, removed ID {event['data'].get('deletedid')}")
        # TODO: Re-point references from data.deletedid to entity_id
    elif action == "voided":
        print(f"Voided: {label}")
        # TODO: Mark the transaction void
    elif action == "emailed":
        print(f"Emailed: {label}")
        # TODO: Record that the document was sent
    else:
        print(f"Unhandled event type: {event['type']}")


@app.post("/webhooks/quickbooks")
async def quickbooks_webhook(
    request: Request,
    intuit_signature: Optional[str] = Header(default=None),
):
    # Read the raw body for signature verification - don't use request.json() first
    raw_body = await request.body()

    if not intuit_signature:
        raise HTTPException(status_code=400, detail="Missing intuit-signature header")

    verifier_token = os.environ.get("QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN")
    if not verify_quickbooks_signature(raw_body, intuit_signature, verifier_token):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after the signature is verified
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    events = normalize_events(payload)
    if events is None:
        raise HTTPException(status_code=400, detail="Unrecognized payload")

    # One notification can contain events for several companies (realm IDs).
    # Intuit expects a 200 within 3 seconds - in production, enqueue and return.
    for event in events:
        handle_event(event)

    return {"received": True, "count": len(events)}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
