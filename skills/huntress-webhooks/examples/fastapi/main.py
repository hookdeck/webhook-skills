# Generated with: huntress-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Huntress Webhook Handler")


def parse_huntress_event(body: Any) -> tuple[Optional[str], Any]:
    """Return (type, payload).

    Huntress's article describes the body only as "a JSON payload describing the
    event". Use `type` when the body has one; otherwise report the event as untyped.
    """
    event_type = body.get("type") if isinstance(body, dict) else None
    return (event_type if isinstance(event_type, str) else None), body


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/huntress")
async def huntress_webhook(
    request: Request,
    svix_id: Optional[str] = Header(None),
    svix_timestamp: Optional[str] = Header(None),
    svix_signature: Optional[str] = Header(None),
):
    secret = os.environ.get("HUNTRESS_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("HUNTRESS_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not (svix_id and svix_timestamp and svix_signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Huntress signed, whatever the Content-Type
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{svix-id}.{svix-timestamp}.{body}" against every
        # v1, signature and enforces a fixed 5-minute timestamp window. Hookdeck retries
        # and replays resend the original timestamp, so use the manual verifier in
        # references/verification.md if late retries must still verify.
        Webhook(secret).verify(
            raw_body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError as err:
        print(f"Huntress webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type, payload = parse_huntress_event(body)
    # svix-id is stable across retries: use it to deduplicate, and log it so you can
    # match it to the Portal's "View Delivery Attempts" page
    print(f"Received Huntress webhook {svix_id}: {event_type or '(untyped payload)'}")

    # Verify, enqueue, return 200 fast: do the real work out of band
    print(f"Huntress payload: {json.dumps(payload)}")

    return {"success": True, "id": svix_id, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
