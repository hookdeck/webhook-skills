# Generated with: terraform-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_terraform_signature(raw_body: bytes, signature_header: Optional[str], token: Optional[str]) -> bool:
    """Verify an HCP Terraform / Terraform Enterprise notification signature.

    For generic notifications with a token set, HCP Terraform sends
    X-TFE-Notification-Signature: the hex HMAC-SHA512 of the RAW request body,
    keyed with the notification configuration's token.
    """
    if not signature_header or not token:
        return False

    expected = hmac.new(
        token.encode("utf-8"),
        raw_body,
        hashlib.sha512,
    ).hexdigest()

    # Timing-safe comparison (case-insensitive hex).
    return hmac.compare_digest(signature_header.lower(), expected)


def get_triggers(payload: dict) -> list:
    """List the triggers carried by a payload.

    - Run payloads (payload_version 1) have a notifications[] array.
    - Workspace payloads (payload_version "2") have a top-level trigger.
    - Change request payloads have no trigger; they are team:change_request.
    """
    if isinstance(payload.get("notifications"), list):
        return [n.get("trigger") for n in payload["notifications"]]
    if payload.get("trigger"):
        return [payload["trigger"]]
    if payload.get("change_request_url"):
        return ["team:change_request"]
    return []


def handle_terraform_event(trigger: str, payload: dict) -> None:
    """Dispatch a single trigger. Do heavy work asynchronously after responding."""
    details = payload.get("details") or {}

    if trigger == "verification":
        # Sent when you enable a configuration or click "Send a test".
        print("Verification request received")

    elif trigger == "run:created":
        print(f"Run {payload.get('run_id')} created in {payload.get('workspace_name')}")
        # TODO: Record the new run.

    elif trigger == "run:planning":
        print(f"Run {payload.get('run_id')} is planning")

    elif trigger == "run:needs_attention":
        print(f"Run {payload.get('run_id')} needs attention: {payload.get('run_url')}")
        # TODO: Notify an approver.

    elif trigger == "run:applying":
        print(f"Run {payload.get('run_id')} is applying")

    elif trigger == "run:completed":
        print(f"Run {payload.get('run_id')} completed in {payload.get('workspace_name')}")
        # TODO: Trigger downstream deploy steps.

    elif trigger == "run:errored":
        status = (payload.get("notifications") or [{}])[0].get("run_status")
        print(f"Run {payload.get('run_id')} errored ({status})")
        # TODO: Alert on-call.

    elif trigger == "assessment:drifted":
        print(f"Drift detected in {details.get('workspace_name')}")
        # TODO: Open a drift ticket.

    elif trigger == "assessment:check_failure":
        print(f"Continuous validation checks failed in {details.get('workspace_name')}")

    elif trigger == "assessment:failed":
        print(f"Health assessment failed in {details.get('workspace_name')}")

    elif trigger in (
        "workspace:auto_destroy_reminder",
        "workspace:auto_destroy_run_results",
        "workspace:deleted",
        "team:change_request",
    ):
        print(f"Received {trigger}")

    else:
        print(f"Unhandled trigger: {trigger}")


@app.post("/webhooks/terraform")
async def terraform_webhook(request: Request):
    token = os.environ.get("TERRAFORM_NOTIFICATION_TOKEN")
    if not token:
        print("TERRAFORM_NOTIFICATION_TOKEN is not set")
        raise HTTPException(status_code=500, detail="Webhook token not configured")

    # Read the raw body (any content type); needed for signature verification.
    raw_body = await request.body()
    signature = request.headers.get("x-tfe-notification-signature")

    if not verify_terraform_signature(raw_body, signature, token):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verifying the raw body.
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    for trigger in get_triggers(payload):
        handle_terraform_event(trigger, payload)

    # Any 2xx passes HCP Terraform's verification request (trigger "verification").
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
