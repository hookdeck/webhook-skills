# Generated with: junction-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Junction Webhook Handler")

DATA_EVENT = re.compile(r"^(daily|historical)\.data\.(.+)\.(created|updated)$")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/junction")
async def junction_webhook(request: Request):
    secret = os.environ.get("JUNCTION_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("JUNCTION_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Junction (Svix) signed
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
        print(f"Junction webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event name is the top-level `event_type`; the payload is under `data`, next to
    # team_id, user_id and client_user_id
    event_type = event.get("event_type")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    user_id = event.get("user_id")
    # The delivery id is stable across retries: use it to deduplicate
    print(f"Received Junction webhook {msg_id}: {event_type}")

    # Data events are named {daily|historical}.data.{resource}.{created|updated}, one per resource
    data_event = DATA_EVENT.match(event_type) if isinstance(event_type, str) else None

    if data_event:
        stage, resource, action = data_event.groups()
        if stage == "historical":
            # Data-less: the backfill for this resource finished. Fetch it through the Data Access API
            print(f"Historical {resource} backfill complete for {user_id}: {data.get('start_date')} {data.get('end_date')}")
        else:
            # Summaries (sleep, activity, workouts, ...) are at `data` and identified by data.id: the latest
            # version replaces earlier ones. Timeseries (steps, heartrate, glucose, ...) have samples at data.data
            samples = data.get("data")
            what = data.get("id") or (f"{len(samples)} samples" if isinstance(samples, list) else None)
            source = data.get("source") if isinstance(data.get("source"), dict) else {}
            print(f"{resource} {action}: {what} from {source.get('slug')}")
    elif event_type == "provider.connection.created":
        source = data.get("source") or data.get("provider") or {}
        print(f"Provider connected: {source.get('slug') if isinstance(source, dict) else None} for {user_id}")
    elif event_type == "provider.connection.error":
        # For example expired credentials: ask the user to reconnect
        print(f"Provider connection error for {user_id}")
    elif event_type in ("provider.device.created", "provider.device.updated"):
        print(f"Device {event_type.split('.')[2]} for {user_id}")
    elif event_type in ("labtest.order.created", "labtest.order.updated"):
        print(f"Lab order {event_type.split('.')[2]}: {data.get('id')}")
    elif event_type in ("labtest.appointment.created", "labtest.appointment.updated"):
        print(f"Lab appointment {event_type.split('.')[2]}: {data.get('id')}")
    elif event_type == "labtest.result.critical":
        # A critical value needs urgent clinical attention: alert someone, don't just log
        print(f"Critical lab result: {data.get('id') or data.get('order_id')}")
    elif event_type == "continuous_query.result_table.changed":
        print(f"Continuous query result table changed for {user_id}")
    else:
        # Return 200 for events you don't handle, or Junction keeps retrying them
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
