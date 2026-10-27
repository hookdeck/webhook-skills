# Generated with: dots-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Mapping, Optional, Tuple

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Dots Webhook Handler")


def resolve_headers(headers: Mapping[str, str]) -> Optional[Tuple[str, str, str]]:
    """Dots delivers through Svix (svix-* headers). Fall back to the Standard Webhooks
    webhook-* names when svix-id is absent, the same way Hookdeck does. Never mix the two sets."""
    prefix = "svix" if headers.get("svix-id") else "webhook"
    msg_id = headers.get(f"{prefix}-id")
    timestamp = headers.get(f"{prefix}-timestamp")
    signature = headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        return None
    return msg_id, timestamp, signature


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/dots")
async def dots_webhook(request: Request):
    secret = os.environ.get("DOTS_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("DOTS_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    resolved = resolve_headers(request.headers)
    if resolved is None:
        raise HTTPException(status_code=400, detail="Missing required webhook headers")
    msg_id, timestamp, signature = resolved

    # Verify the RAW body: the exact bytes Dots (Svix) signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # The values go in under both header-name sets, which the svix library accepts either of.
        Webhook(secret).verify(
            raw_body,
            {
                "svix-id": msg_id,
                "svix-timestamp": timestamp,
                "svix-signature": signature,
                "webhook-id": msg_id,
                "webhook-timestamp": timestamp,
                "webhook-signature": signature,
            },
        )
    except (WebhookVerificationError, ValueError) as err:
        # The svix library raises a plain ValueError (not WebhookVerificationError) on a malformed
        # signature entry such as one with no comma, so treat both as a failed verification.
        print(f"Dots webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the body's top-level `event` field. Payloads carry only ids:
    # fetch the resource from the Dots API for its current state.
    event_type = event.get("event")
    # svix-id is stable across retries: use it to deduplicate
    print(f"Received Dots webhook {msg_id}: {event_type}")

    if event_type == "payment_intent.updated":
        print(f"Payment intent updated: {event.get('payment_intent_id')}")
    elif event_type == "payment_method.updated":
        print(f"Payment method updated: {event.get('payment_method_id')}")
    elif event_type == "flow.updated":
        print(f"Flow updated: {event.get('flow_id')}")
    elif event_type == "dispute.updated":
        print(f"Dispute updated: {event.get('dispute_id')}")
    elif event_type == "payout_request.updated":
        print(f"Payout request updated: {event.get('payout_request_id')}")
    elif event_type == "organization.updated":
        print(f"Organization updated: {event.get('organization_id')}")
    elif event_type == "app.updated":
        print(f"App updated: {event.get('app_id')}")
    elif event_type == "transfer.updated":
        print(f"Transfer updated: {event.get('transfer_id')}")
    elif event_type == "payout_link.updated":
        print(f"Payout link updated: {event.get('payout_link_id')}")
    elif event_type == "user.updated":
        print(f"User updated: {event.get('user_id')}")
    elif event_type == "user.onboarded":
        # Sent once per verified bank account
        print(f"User onboarded: {event.get('user_id')} bank account: {event.get('ach_account_id')}")
    elif event_type == "user.onboarding_revoked":
        print(
            f"User onboarding revoked: {event.get('user_id')} bank account: "
            f"{event.get('ach_account_id')} reason: {event.get('reason')}"
        )
    else:
        print(f"Unhandled event type: {event_type}")

    # `api_app_id` is present when an app-originated webhook arrives at an organization-level endpoint
    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
