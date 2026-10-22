# Generated with: footprint-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Footprint Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/footprint")
async def footprint_webhook(
    request: Request,
    svix_id: Optional[str] = Header(None),
    svix_timestamp: Optional[str] = Header(None),
    svix_signature: Optional[str] = Header(None),
):
    secret = os.environ.get("FOOTPRINT_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("FOOTPRINT_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not (svix_id and svix_timestamp and svix_signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Footprint (Svix) signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{svix-id}.{svix-timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        Webhook(secret).verify(
            raw_body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError as err:
        print(f"Footprint webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is in the body's `event_kind` field
    event_type = event.get("event_kind")
    # svix-id is stable across retries: use it to deduplicate
    print(f"Received Footprint webhook {svix_id}: {event_type}")

    if event_type == "footprint.onboarding.completed":
        print(f"Onboarding completed: {event.get('fp_id')} {event.get('status')} manual review: {event.get('requires_manual_review')}")
    elif event_type == "footprint.onboarding.incomplete":
        print(f"Onboarding incomplete: {event.get('fp_id')} {event.get('onboarding_id')}")
    elif event_type == "footprint.onboarding.status_changed":
        # Deprecated by Footprint in favor of onboarding.completed and user.manual_review
        print(f"Onboarding status changed: {event.get('fp_id')} {event.get('new_status')}")
    elif event_type == "footprint.watchlist_check.completed":
        print(f"Watchlist check completed: {event.get('fp_id')} {event.get('status')} {event.get('error')}")
    elif event_type == "footprint.user.manual_review":
        # Call GET /users/{fp_id} for the user's new status
        print(f"Manual review changed status: {event.get('fp_id')}")
    elif event_type == "footprint.user.info_requested":
        print(f"More information requested from user: {event.get('fp_id')}")
    elif event_type == "footprint.user.bank_link_updated":
        print(f"Bank link updated: {event.get('link_id')} {event.get('link_state')}")
    elif event_type == "footprint.vault.updated":
        print(f"Vault updated: {event.get('fp_id')} {event.get('fields')}")
    elif event_type == "footprint.entity.entity_status_set":
        print(f"Entity status set: {event.get('fp_id')} {event.get('status')}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
