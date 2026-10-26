# Generated with: fiber-ai-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Fiber AI Webhook Handler")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/webhooks/fiber-ai")
async def fiber_ai_webhook(
    request: Request,
    svix_id: str = Header(None),
    svix_timestamp: str = Header(None),
    svix_signature: str = Header(None),
):
    """Receive and verify a Fiber AI webhook (delivered through Svix)."""
    if not all([svix_id, svix_timestamp, svix_signature]):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    secret = os.environ.get("FIBER_AI_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("Invalid webhook secret configuration")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Verify against the RAW body (any content type), never a re-serialized payload.
    body = await request.body()
    try:
        # The svix library decodes the whsec_ secret, checks every v1 signature in
        # constant time and enforces a fixed 5-minute timestamp window. Hookdeck
        # retries/replays resend the ORIGINAL timestamp, so late retries are rejected;
        # see references/verification.md for a verifier without that window.
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
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Verified: only now is it safe to parse.
    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Fiber AI documents no event-type field or header (one endpoint per event type is the
    # reliable way to tell events apart). Read `type` defensively if present; job.changed
    # carries a `profiles` array and is recognised by that shape.
    event_type = event.get("type")
    if not isinstance(event_type, str):
        event_type = "job.changed" if isinstance(event.get("profiles"), list) else "unknown"
    print(f"Received Fiber AI webhook: {event_type} ({svix_id})")

    if event_type == "reveal.completed":
        print(f"Reveal finished: {event.get('task_id')} success={event.get('success')}")
    elif event_type == "batch_live_enrich.completed":
        # Reports per-outcome counts (completed / failed / not_found / malformed), no `error`
        print(f"Batch live enrich finished: {event.get('task_id')}")
    elif event_type == "batch_contact_enrich.completed":
        print(f"Batch contact enrich finished: {event.get('task_id')} success={event.get('success')}")
    elif event_type == "mosaic.completed":
        print(f"File repair finished: {event.get('task_id')} success={event.get('success')}")
    elif event_type == "audience.enrichment_completed":
        print(f"Audience enrichment finished: {event.get('audience_id')} success={event.get('success')}")
    elif event_type == "tracker.signal_detected":
        # Stable eventId for dedupe; order by occurredAt, not arrival
        print(f"Tracker signal: {event.get('eventId')} at {event.get('occurredAt')}")
    elif event_type == "job.changed":
        print(f"Job changes: {len(event.get('profiles') or [])} profiles")
    else:
        print(f"Unhandled event type: {event_type}")

    # Acknowledge fast; do heavy work asynchronously (15 second delivery timeout).
    return JSONResponse(content={"success": True, "type": event_type}, status_code=200)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
