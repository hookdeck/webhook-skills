# Generated with: vanta-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Vanta Webhook Handler")

# Top-level payload keys, one per Vanta event domain
DOMAIN_KEYS = ["questionnaire", "trustCenter", "vendor", "informationRequest", "evidence", "control"]


def parse_vanta_event(body: Any) -> tuple[Optional[str], dict, Optional[str]]:
    """Return (type, payload, domain).

    Vanta documents the event payload (e.g. {"questionnaire": {...}}) but not an
    envelope. If the body carries a `type`, use it; otherwise treat the body as
    the payload and route on its top-level key.
    """
    if isinstance(body, dict) and isinstance(body.get("type"), str):
        event_type = body["type"]
        payload = body.get("payload") or body.get("data") or {}
    else:
        event_type = None
        payload = body if isinstance(body, dict) else {}
    domain = next((key for key in DOMAIN_KEYS if key in payload), None)
    return event_type, payload, domain


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/vanta")
async def vanta_webhook(
    request: Request,
    svix_id: Optional[str] = Header(None),
    svix_timestamp: Optional[str] = Header(None),
    svix_signature: Optional[str] = Header(None),
):
    secret = os.environ.get("VANTA_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("VANTA_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not (svix_id and svix_timestamp and svix_signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Vanta signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{svix-id}.{svix-timestamp}.{body}" against every
        # v1, signature and enforces the 5-minute timestamp window.
        Webhook(secret).verify(
            raw_body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError as err:
        print(f"Vanta webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type, payload, domain = parse_vanta_event(body)
    # svix-id is stable across retries: use it to deduplicate
    label = event_type or f"({domain or 'unknown'} payload)"
    print(f"Received Vanta webhook {svix_id}: {label}")

    if event_type == "v1.questionnaire.status-changed":
        print(f"Questionnaire status changed: {payload.get('questionnaire')}")
    elif event_type == "v1.questionnaire.export-completed":
        print(f"Questionnaire export ready: {payload.get('export', {}).get('id')}")
    elif event_type == "v1.vendor.decision.created":
        vendor = payload.get("vendor", {})
        print(f"Vendor decision: {vendor.get('id')} {vendor.get('decision', {}).get('status')}")
    elif event_type == "v1.trust-center.access-request.received":
        print(f"Trust Center access request received: {payload.get('accessRequest', {}).get('id')}")
    elif event_type == "v1.trust-center.access-request.approved":
        print(f"Trust Center access request approved: {payload.get('accessRequest', {}).get('id')}")
    elif event_type == "v1.evidence.status-changed":
        evidence = payload.get("evidence", {})
        print(f"Evidence status: {evidence.get('oldStatus')} -> {evidence.get('newStatus')}")
    elif event_type is None:
        # No type in the body: fetch the referenced object from the Manage Vanta API if needed
        print(f"Untyped {domain} event: {payload.get(domain) if domain else payload}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type, "domain": domain}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
