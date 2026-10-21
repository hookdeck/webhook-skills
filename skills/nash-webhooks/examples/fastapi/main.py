# Generated with: nash-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Nash Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/nash")
async def nash_webhook(
    request: Request,
    # Nash delivers webhooks through Svix.
    svix_id: str | None = Header(None),
    svix_timestamp: str | None = Header(None),
    svix_signature: str | None = Header(None),
):
    secret = os.environ.get("NASH_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("NASH_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not (svix_id and svix_timestamp and svix_signature):
        raise HTTPException(status_code=400, detail="Missing Svix signature headers")

    # The signature covers the RAW body bytes, so read them before any parsing.
    body = await request.body()

    try:
        # HMAC-SHA256 over "{svix-id}.{svix-timestamp}.{raw body}" with a
        # 5-minute timestamp tolerance. In svix 2.x verify() returns None.
        Webhook(secret).verify(
            body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError as err:
        print(f"Nash webhook verification failed: {err}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Verified: only now is it safe to parse.
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Envelope: { type, event, data }. type is the entity (delivery, task,
    # courier_location, courier_name, shift); event is the status within it.
    event = payload.get("event")
    data = payload.get("data") or {}
    event_type = f"{payload.get('type')}.{event}"

    # svix-id is the same on every retry of a message: use it to deduplicate.
    print(f"Received Nash webhook {event_type} ({svix_id})")

    if event_type in ("delivery.created", "delivery.assigned_driver"):
        print(f"Delivery progressing: {data.get('id')} {event}")
    elif event_type == "delivery.dropoff_complete":
        print(f"Delivery completed: {data.get('id')}")
    elif event_type in ("delivery.canceled_by_provider", "delivery.failed"):
        print(f"Delivery did not complete: {data.get('id')} {event}")
    elif event_type == "task.created":
        # A new task (delivery attempt) on the job, e.g. after a reassignment.
        print(f"Task created: {data.get('id')}")
    elif event_type in ("task.canceled_by_provider", "task.failed"):
        # Terminal for this task only; the job may continue on another task.
        print(f"Task ended: {data.get('id')} {event}")
    elif event_type in ("courier_location.updated", "courier_name.updated"):
        print(f"Courier update: {data.get('id')} {event}")
    elif event_type == "shift.dispatched":
        print(f"Shift dispatched: jobs={data.get('created_job_ids')} errors={data.get('errors')}")
    else:
        print(f"Unhandled Nash event: {event_type}")

    return {"received": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
