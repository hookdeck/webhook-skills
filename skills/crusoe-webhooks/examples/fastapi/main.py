# Generated with: crusoe-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Crusoe Cloud Webhook Handler")


def get_event_type(payload: dict) -> str:
    """Crusoe doesn't document an event-type field in the body (the event type is
    picked per endpoint in the Svix dashboard), so read one if present and
    otherwise recognise the documented remediation payload by its fields."""
    for key in ("type", "event_type"):
        if isinstance(payload.get(key), str):
            return payload[key]
    if payload.get("workflow_type") and payload.get("resource_id"):
        return "resource.automated_remediation"
    return "unknown"


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/crusoe")
async def crusoe_webhook(
    request: Request,
    svix_id: str | None = Header(None),
    svix_timestamp: str | None = Header(None),
    svix_signature: str | None = Header(None),
):
    secret = os.environ.get("CRUSOE_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("Invalid webhook secret configuration")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not all([svix_id, svix_timestamp, svix_signature]):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify against the RAW body, never a re-serialized payload.
    body = await request.body()
    try:
        # Crusoe delivers through Svix: HMAC-SHA256 over "id.timestamp.body".
        # The SDK checks every v1 signature and a 5-minute timestamp window.
        Webhook(secret).verify(
            body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError as err:
        print(f"Webhook verification failed: {err}")
        detail = "Invalid timestamp" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    # Verified: now parse. Payload structure varies by event type.
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = get_event_type(payload)
    print(f"Received Crusoe webhook {svix_id}: {event_type}")

    if event_type == "resource.automated_remediation":
        triggered_by = payload.get("triggered_by") or {}
        print(
            "Automated remediation:",
            {
                "status": payload.get("status"),
                "workflow": payload.get("workflow_type"),
                "resource": payload.get("resource_name") or payload.get("resource_id"),
                "cluster": payload.get("cluster_name") or payload.get("cluster_id"),
                "error": triggered_by.get("error_name") if isinstance(triggered_by, dict) else None,
            },
        )
    else:
        # Budget, organization and Managed AI payloads aren't documented yet.
        print(f"Unhandled Crusoe notification, fields: {list(payload.keys())}")

    return {"received": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
