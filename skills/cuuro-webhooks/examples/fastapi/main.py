# Generated with: cuuro-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Cuuro Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """Cuuro sends svix-* headers; Hookdeck also accepts the Standard Webhooks webhook-* names."""
    prefix = "svix" if headers.get("svix-id") else "webhook"
    return (
        headers.get(f"{prefix}-id"),
        headers.get(f"{prefix}-timestamp"),
        headers.get(f"{prefix}-signature"),
    )


@app.post("/webhooks/cuuro")
async def cuuro_webhook(request: Request):
    secret = os.environ.get("CUURO_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("CUURO_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    msg_id, timestamp, signature = read_signature_headers(request.headers)
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Cuuro (Svix) signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
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
    except WebhookVerificationError as err:
        print(f"Cuuro webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The event type is the top-level `event` field, beside `data`: {"data": {"id": ...}, "event": ...}
    event_type: Optional[str] = payload.get("event")
    data = payload.get("data")
    resource_id = data.get("id") if isinstance(data, dict) else None
    # The svix-id is stable across retries: use it to deduplicate
    print(f"Received Cuuro webhook {msg_id}: {event_type}")

    if event_type == "startup.created":
        # data.id is the id of the new target company
        print(f"Target company created: {resource_id}")
    elif event_type == "analysis.created":
        # data.id is the analysis id
        print(f"Analysis created: {resource_id}")
    elif event_type == "analysis.completed":
        # data.id is the analysis id; fetch the results from the Cuuro API
        print(f"Analysis completed: {resource_id}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
