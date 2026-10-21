# Generated with: taskrabbit-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Taskrabbit Webhook Handler")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/webhooks/taskrabbit")
async def taskrabbit_webhook(
    request: Request,
    # Taskrabbit delivers via Svix: svix-* headers (webhook-* if white-labeled).
    svix_id: str = Header(None),
    svix_timestamp: str = Header(None),
    svix_signature: str = Header(None),
    webhook_id: str = Header(None),
    webhook_timestamp: str = Header(None),
    webhook_signature: str = Header(None),
):
    """Receive and verify a Taskrabbit webhook using the official svix SDK."""
    msg_id = svix_id or webhook_id
    timestamp = svix_timestamp or webhook_timestamp
    signature = svix_signature or webhook_signature
    if not all([msg_id, timestamp, signature]):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    secret = os.environ.get("TASKRABBIT_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("Invalid webhook secret configuration")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Verify against the RAW body — never a re-serialized payload.
    body = await request.body()
    wh = Webhook(secret)
    try:
        # The SDK enforces the 5-minute tolerance and checks every signature in
        # constant time. As of svix 2.x it verifies only and returns None, so the
        # payload is parsed separately below.
        wh.verify(
            body,
            {
                "svix-id": msg_id,
                "svix-timestamp": timestamp,
                "svix-signature": signature,
            },
        )
    except WebhookVerificationError as err:
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        print(f"Webhook verification failed: {err}")
        raise HTTPException(status_code=400, detail=detail)

    # Verified — only now is it safe to parse.
    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Taskrabbit payloads are flat: the event name is in `event` (not `type`).
    event_name = event.get("event", "unknown")
    project_uuid = event.get("project_uuid")

    print(f"Received Taskrabbit webhook: {event_name} (svix-id {msg_id})")

    if event_name == "project.completed":
        print(f"Project completed: {project_uuid} ({event.get('agreement_external_reference')})")
        # TODO: mark the order fulfilled in your system
    elif event_name == "project.canceled":
        print(f"Project canceled: {project_uuid} reason={event.get('cancellation_reason')}")
        # TODO: release the order / notify the customer
    elif event_name == "project.rescheduled":
        print(
            f"Project rescheduled: {project_uuid} "
            f"{event.get('previous_start_time')} -> {event.get('new_start_time')}"
        )
        # TODO: update the scheduled start time
    else:
        print(f"Unhandled event type: {event_name}")

    return JSONResponse(content={"success": True, "event": event_name}, status_code=200)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
