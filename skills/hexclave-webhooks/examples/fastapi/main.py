# Generated with: hexclave-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Hexclave Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """Hexclave (via Svix) sends svix-* headers; Hookdeck also accepts the Standard Webhooks webhook-* names."""
    prefix = "svix" if headers.get("svix-id") else "webhook"
    return (
        headers.get(f"{prefix}-id"),
        headers.get(f"{prefix}-timestamp"),
        headers.get(f"{prefix}-signature"),
    )


@app.post("/webhooks/hexclave")
async def hexclave_webhook(request: Request):
    secret = os.environ.get("HEXCLAVE_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("HEXCLAVE_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    msg_id, timestamp, signature = read_signature_headers(request.headers)
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Svix signed
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
        print(f"Hexclave webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The body is {type, data}: `type` is the event name, `data` the user, team, membership or permission
    event_type: Optional[str] = payload.get("type")
    data = payload.get("data")
    if not isinstance(data, dict):
        data = {}
    # The svix-id is stable across retries: use it to deduplicate
    print(f"Received Hexclave webhook {msg_id}: {event_type}")

    if event_type == "user.created":
        print(f"User created: {data.get('id')}")
    elif event_type == "user.updated":
        print(f"User updated: {data.get('id')}")
    elif event_type == "user.deleted":
        print(f"User deleted: {data.get('id')}")
    elif event_type == "team.created":
        print(f"Team created: {data.get('id')} {data.get('display_name')}")
    elif event_type == "team.updated":
        print(f"Team updated: {data.get('id')} {data.get('display_name')}")
    elif event_type == "team.deleted":
        print(f"Team deleted: {data.get('id')}")
    elif event_type == "team_membership.created":
        print(f"Team membership created: {data}")
    elif event_type == "team_membership.deleted":
        print(f"Team membership deleted: {data}")
    elif event_type == "team_permission.created":
        print(f"Team permission created: {data}")
    elif event_type == "team_permission.deleted":
        print(f"Team permission deleted: {data}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
