# Generated with: voiceflow-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Voiceflow Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/voiceflow")
async def voiceflow_webhook(request: Request):
    secret = os.environ.get("VOICEFLOW_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("VOICEFLOW_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        # The project-level session webhook doesn't send these headers
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Voiceflow (Svix) signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # The library accepts either header-name set, so hand it the resolved values under both.
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
        # A malformed signature entry raises a plain ValueError rather than WebhookVerificationError
        print(f"Voiceflow webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the top-level `type`; the details sit under `data`, and `time` is Unix ms
    event_type = event.get("type")
    data = event.get("data")
    if not isinstance(data, dict):
        data = {}
    # The delivery id is stable across retries: use it to deduplicate
    print(f"Received Voiceflow webhook {msg_id}: {event_type} ({event.get('resource')})")

    if event_type == "organization.project.created":
        print(f"Project created: {data.get('projectID')} {(data.get('projectMetadata') or {}).get('name')}")
    elif event_type == "organization.project.deleted":
        print(f"Project deleted: {data.get('projectID')} {(data.get('projectMetadata') or {}).get('name')}")
    elif event_type == "organization.project.environment.created":
        print(f"Environment created: {data.get('createdProjectEnvironmentID')} from {(data.get('source') or {}).get('environmentID')}")
    elif event_type == "organization.project.environment.published":
        print(
            f"Environment published: {data.get('publishedProjectEnvironmentID')} "
            f"{data.get('publishedVersionIDBefore')} -> {data.get('publishedVersionIDAfter')}"
        )
    elif event_type == "organization.project.environment.merged":
        print(
            f"Environment merged: {data.get('sourceProjectEnvironmentID')} -> "
            f"{data.get('targetProjectEnvironmentID')} source removed: {data.get('sourceProjectEnvironmentRemoved')}"
        )
    elif event_type == "organization.project.environment.deleted":
        print(f"Environment deleted: {data.get('deletedProjectEnvironmentID')}")
    else:
        # Return 200 for events you don't handle; the documented list may not be exhaustive
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
