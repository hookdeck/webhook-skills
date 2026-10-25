# Generated with: incident-io-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import time
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI(title="incident.io Webhook Handler")

POSITIVE_INT_RE = re.compile(r"[1-9][0-9]*")


def secret_to_key(secret: Optional[str]) -> Optional[bytes]:
    """Turn the endpoint's Signing secret into HMAC key bytes (Standard Webhooks rule).

    `whsec_<base64>` -> base64-decode the part after the prefix; anything else -> UTF-8
    bytes. Returns None for a secret that is malformed or decodes to zero bytes.
    """
    if not secret:
        return None
    if not secret.startswith("whsec_"):
        return secret.encode("utf-8")
    try:
        key = base64.b64decode(secret[len("whsec_"):], validate=True)
    except (binascii.Error, ValueError):
        return None
    return key or None


def verify_incident_io_signature(
    raw_body: bytes,
    webhook_id: Optional[str],
    webhook_timestamp: Optional[str],
    webhook_signature: Optional[str],
    key: bytes,
    tolerance_seconds: Optional[int] = None,
) -> Optional[str]:
    """Verify an incident.io webhook. Returns None on success, else an error message.

    signed content = "{webhook-id}.{webhook-timestamp}." + raw body
    expected       = base64(HMAC-SHA256(key, signed content))
    webhook-signature is a space-delimited list of "v1,<base64>" entries (several
    during a secret rotation); any v1 match passes.
    """
    if not (webhook_id and webhook_timestamp and webhook_signature):
        return "Missing required webhook headers"
    if not POSITIVE_INT_RE.fullmatch(webhook_timestamp):
        return "Invalid webhook-timestamp"

    if tolerance_seconds is not None:
        if abs(int(time.time()) - int(webhook_timestamp)) > tolerance_seconds:
            return "Timestamp outside tolerance window"

    signed = f"{webhook_id}.{webhook_timestamp}.".encode("utf-8") + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest())

    for entry in webhook_signature.split(" "):
        version, _, received = entry.partition(",")
        # Both sides are bytes: compare_digest raises TypeError on non-ASCII str
        if version == "v1" and hmac.compare_digest(received.encode("utf-8"), expected):
            return None
    return "Invalid signature"


def tolerance_from_env() -> Optional[int]:
    value = os.environ.get("INCIDENT_IO_WEBHOOK_TOLERANCE_SECONDS", "")
    return int(value) if POSITIVE_INT_RE.fullmatch(value) else None


def handle_event(event_type: str, resource: Any) -> None:
    """Route on event_type. The resource sits under a key named after the event type."""
    r = resource if isinstance(resource, dict) else {}

    # Private incidents, alerts and escalations carry only the resource id.
    # Fetch details from the REST API with a key that has private access.
    if event_type in (
        "private_incident.incident_created_v2",
        "private_incident.incident_updated_v2",
        "private_incident.action_created_v1",
        "private_incident.action_updated_v1",
        "private_incident.follow_up_created_v1",
        "private_incident.follow_up_created_v2",
        "private_incident.follow_up_updated_v1",
        "private_incident.follow_up_updated_v2",
        "private_incident.postmortem_document_status_updated_v1",
        "private_alert.alert_created_v1",
        "private_alert.alert_resolved_v1",
        "private_escalation.escalation_created_v1",
        "private_escalation.escalation_status_updated_v1",
    ):
        print(f"{event_type}: private resource {r.get('id')} (fetch details via the API)")
    elif event_type in (
        "private_incident.membership_granted_v1",
        "private_incident.membership_revoked_v1",
    ):
        print(f"{event_type}: user {r.get('user_id')} on incident {r.get('incident_id')}")
    elif event_type in (
        "public_incident.incident_created_v2",
        "public_incident.incident_updated_v2",
    ):
        status = (r.get("incident_status") or {}).get("name")
        print(f"{event_type}: {r.get('reference')} {r.get('name')} ({status})")
    elif event_type == "public_incident.incident_status_updated_v2":
        incident = r.get("incident") or {}
        previous = (r.get("previous_status") or {}).get("name")
        new = (r.get("new_status") or {}).get("name")
        print(f"Incident {incident.get('reference')}: {previous} -> {new}")
    elif event_type in (
        # action_* is the older naming for follow-ups; both are still emitted
        "public_incident.action_created_v1",
        "public_incident.action_updated_v1",
        "public_incident.follow_up_created_v1",
        "public_incident.follow_up_created_v2",
        "public_incident.follow_up_updated_v1",
        "public_incident.follow_up_updated_v2",
    ):
        print(f"{event_type}: follow-up {r.get('id')} on incident {r.get('incident_id')} ({r.get('status')})")
    elif event_type == "public_incident.postmortem_document_status_updated_v1":
        doc = r.get("postmortem_document") or {}
        print(f"Postmortem {doc.get('id')}: {r.get('previous_status')} -> {r.get('new_status')}")
    elif event_type in ("public_alert.alert_created_v1", "public_alert.alert_resolved_v1"):
        print(f"{event_type}: {r.get('title')} ({r.get('status')})")
    elif event_type == "public_escalation.escalation_created_v1":
        print(f"Escalation created: {r.get('title')} ({r.get('status')})")
    elif event_type == "public_escalation.escalation_status_updated_v1":
        escalation = r.get("escalation") or {}
        print(f"Escalation {escalation.get('id')}: {r.get('previous_status')} -> {r.get('new_status')}")
    elif event_type in ("schedule.created_v1", "schedule.updated_v1", "schedule.deleted_v1"):
        print(f"{event_type}: {r.get('name')} ({r.get('id')})")
    elif event_type == "schedule.shift_change_v1":
        schedule = r.get("schedule") or {}
        users = [u.get("name") for u in r.get("current_users") or []]
        print(f"On-call change for {schedule.get('name')}: {users}")
    elif event_type == "status_page_incident.update_shared_v1":
        spi = r.get("status_page_incident") or {}
        print(f"Status page update for {spi.get('name')} ({spi.get('incident_status')})")
    else:
        print(f"Unhandled incident.io event type: {event_type}")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/incident-io")
async def incident_io_webhook(
    request: Request,
    webhook_id: Optional[str] = Header(None),
    webhook_timestamp: Optional[str] = Header(None),
    webhook_signature: Optional[str] = Header(None),
):
    key = secret_to_key(os.environ.get("INCIDENT_IO_WEBHOOK_SECRET"))
    if key is None:
        print("INCIDENT_IO_WEBHOOK_SECRET is missing or malformed")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Verify the RAW body: the exact bytes incident.io signed
    raw_body = await request.body()
    error = verify_incident_io_signature(
        raw_body, webhook_id, webhook_timestamp, webhook_signature, key, tolerance_from_env()
    )
    if error:
        print(f"incident.io webhook verification failed: {error}")
        raise HTTPException(status_code=400, detail=error)

    # Parse only after the signature checks out
    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = body.get("event_type") if isinstance(body, dict) else None
    if not isinstance(event_type, str):
        raise HTTPException(status_code=400, detail="Missing event_type")
    resource = body.get(event_type)  # NOT body["data"]: the key is the event type string

    # webhook-id is stable across retries: deduplicate on it
    print(f"Received incident.io webhook {webhook_id}: {event_type}")
    handle_event(event_type, resource)

    return {"received": True, "eventType": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
