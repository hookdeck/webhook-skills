# Generated with: propelauth-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="PropelAuth Webhook Handler")


def parse_propelauth_event(body: Any) -> tuple[Optional[str], dict]:
    """Return (type, data).

    PropelAuth's docs say each payload includes the event type but don't name the
    field; read `event_type`, falling back to `type`.
    """
    data = body if isinstance(body, dict) else {}
    event_type = data.get("event_type") or data.get("type")
    return (event_type if isinstance(event_type, str) else None), data


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/propelauth")
async def propelauth_webhook(
    request: Request,
    svix_id: Optional[str] = Header(None),
    svix_timestamp: Optional[str] = Header(None),
    svix_signature: Optional[str] = Header(None),
):
    secret = os.environ.get("PROPELAUTH_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("PROPELAUTH_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not (svix_id and svix_timestamp and svix_signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes PropelAuth (Svix) signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{svix-id}.{svix-timestamp}.{body}" against every
        # v1, signature and enforces the 5-minute timestamp window.
        Webhook(secret).verify(
            raw_body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError as err:
        print(f"PropelAuth webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type, data = parse_propelauth_event(body)
    # svix-id is stable across retries: use it to deduplicate
    print(f"Received PropelAuth webhook {svix_id}: {event_type}")

    if event_type == "user.created":
        print(f"New user signed up: {data.get('user_id')}")
    elif event_type == "user.updated":
        # Only the ID is sent so out-of-order deliveries can't overwrite newer data
        print(f"User updated, fetch the latest from the API: {data.get('user_id')}")
    elif event_type == "user.deleted":
        print(f"User deleted: {data.get('user_id')}")
    elif event_type == "org.created":
        print(f"Organization created: {data.get('org_id')}")
    elif event_type == "user.added_to_org":
        print(f"User added to org: {data.get('user_id')} {data.get('org_id')}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"success": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
