# Generated with: openlayer-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

app = FastAPI(title="Openlayer Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """Openlayer sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


@app.post("/webhooks/openlayer")
async def openlayer_webhook(request: Request):
    secret = os.environ.get("OPENLAYER_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("OPENLAYER_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    sig_headers = read_signature_headers(request.headers)
    if not all(sig_headers.values()):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Openlayer signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # A malformed signature entry raises ValueError rather than WebhookVerificationError, so catch Exception.
        Webhook(secret).verify(raw_body, sig_headers, json_parse=False)
    except Exception as err:
        print(f"Openlayer webhook verification failed: {err}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Every body is { type, timestamp, data }: the event name is the dotted top-level `type`
    # (data.test.type is the test's own category, not the event type)
    event_type = event.get("type")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    # webhook-id is stable across retries: use it to deduplicate. Order events by event["timestamp"].
    print(f"Received Openlayer webhook {sig_headers['webhook-id']}: {event_type}")

    if event_type == "test.created":
        test = data.get("test") if isinstance(data.get("test"), dict) else {}
        print(f"Test created: {test.get('id')} {test.get('name')} {test.get('type')}")
    elif event_type == "test.updated":
        test = data.get("test") if isinstance(data.get("test"), dict) else {}
        print(f"Test updated: {test.get('id')} {test.get('name')}")
    elif event_type == "test.deleted":
        # Only the test id is sent after deletion
        test = data.get("test") if isinstance(data.get("test"), dict) else {}
        print(f"Test deleted: {test.get('id')}")
    elif event_type == "tests.result.updated":
        # One event per suite run; alert when anything failed
        run = data.get("tests") if isinstance(data.get("tests"), dict) else {}
        print(
            f"Test run finished: {run.get('passing')}/{run.get('total')} passing, "
            f"{run.get('failing')} failing, {run.get('skipped')} skipped, {run.get('running')} running"
        )
        if (run.get("failing") or 0) > 0:
            print(f"ALERT: failing tests in project {run.get('projectId')}")
    else:
        # The documented list may grow: ignore what you don't need
        print(f"Unhandled event type: {event_type}")

    return {"received": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
