# Generated with: isnap-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from standardwebhooks.webhooks import Webhook

load_dotenv()

app = FastAPI(title="iSnap Webhook Handler")

# Demo only: use a database or cache with a TTL in production
seen_event_ids = set()


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """iSnap sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


def read_secrets():
    """ISNAP_WEBHOOK_SECRET is one whsec_ secret, or a comma-separated list while you rotate:
    iSnap signs with the new secret only, from the moment you rotate."""
    secrets = [s.strip() for s in os.environ.get("ISNAP_WEBHOOK_SECRET", "").split(",") if s.strip()]
    if secrets and all(s.startswith("whsec_") for s in secrets):
        return secrets
    return None


def verify(raw_body, sig_headers, secrets):
    for secret in secrets:
        try:
            # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
            # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
            # A malformed signature entry raises ValueError rather than WebhookVerificationError, so catch Exception.
            Webhook(secret).verify(raw_body, sig_headers, json_parse=False)
            return True
        except Exception:
            continue
    return False


@app.post("/webhooks/isnap")
async def isnap_webhook(request: Request):
    secrets = read_secrets()
    if not secrets:
        print("ISNAP_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    sig_headers = read_signature_headers(request.headers)
    if not all(sig_headers.values()):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes iSnap signed
    raw_body = await request.body()
    if not verify(raw_body, sig_headers, secrets):
        print("iSnap webhook verification failed")
        # Never answer 410: iSnap turns the subscription off
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The envelope is { api_version, event_id, event_type, created_at, trace_id, data };
    # event_id equals the webhook-id header and is the dedupe key
    event_id = event.get("event_id") or sig_headers["webhook-id"]
    event_type = event.get("event_type")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}

    if event_id in seen_event_ids:
        print(f"Duplicate iSnap event {event_id}: {event_type}")
        return Response(status_code=204)
    seen_event_ids.add(event_id)
    print(f"Received iSnap webhook {event_id}: {event_type}")

    if event_type == "message.received":
        message = data.get("message") if isinstance(data.get("message"), dict) else {}
        print(f"Message received: {message.get('id')} in chat {data.get('chat_id')}")
    elif event_type in (
        "message.queued", "message.scheduled", "message.sent", "message.delivered", "message.read",
        "message.failed", "message.cancelled", "message.fallback_triggered",
    ):
        message = data.get("message") if isinstance(data.get("message"), dict) else {}
        print(f"Message status {event_type}: {message.get('id')}")
    elif event_type in ("reaction.added", "reaction.received", "reaction.removed"):
        print(f"Reaction event {event_type}")
    elif event_type in ("typing_indicator.started", "typing_indicator.stopped"):
        print(f"Typing indicator event {event_type}")
    elif event_type in (
        "line.connected", "line.disconnected", "line.offline", "line.degraded", "line.apple_id_flagged",
        "line.quota_warning", "line.quota_exceeded", "line.capability_changed", "line.terminated",
        "line.variant_changed", "line.variant_scheduled", "line.variant_unscheduled",
    ):
        print(f"Line event {event_type}: {data.get('line_metadata')}")
    elif event_type in (
        "trial.linked", "trial.dormant", "trial.reactivated", "trial.bind_conflict", "trial.revoked",
    ):
        print(f"Trial event {event_type}")
    elif event_type in ("pre_order.fulfilled", "pre_order.cancelled"):
        print(f"Pre-order event {event_type}")
    elif event_type in ("macos_session.rented", "macos_session.released"):
        print(f"macOS session event {event_type}")
    elif event_type == "binding.released":
        print("Binding released")
    elif event_type == "webhook.test":
        # A signed probe to a suspended subscription: a 2xx resumes it
        print("Probe received: subscription will resume")
    else:
        # Events can arrive out of order and the documented list may grow: ignore what you don't need
        print(f"Unhandled event type: {event_type}")

    # 2xx within 10 seconds with an empty body; do slow work after responding in production
    return Response(status_code=204)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
