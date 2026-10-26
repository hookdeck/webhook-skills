# Generated with: pganalyze-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

app = FastAPI(title="pganalyze Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """pganalyze sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


@app.post("/webhooks/pganalyze")
async def pganalyze_webhook(request: Request):
    secret = os.environ.get("PGANALYZE_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("PGANALYZE_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    sig_headers = read_signature_headers(request.headers)
    if not all(sig_headers.values()):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes pganalyze signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # A malformed signature entry raises ValueError rather than WebhookVerificationError, so catch Exception.
        Webhook(secret).verify(raw_body, sig_headers, json_parse=False)
    except Exception as err:
        print(f"pganalyze webhook verification failed: {err}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Every body is { type, id, timestamp, version, organization, data }: the event name is the top-level `type`
    event_type = event.get("type")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    issue = data.get("issue") if isinstance(data.get("issue"), dict) else {}
    server_name = (data.get("server") or {}).get("name") if isinstance(data.get("server"), dict) else None
    # webhook-id (also the body `id`) is stable across retries: use it to deduplicate
    print(f"Received pganalyze webhook {sig_headers['webhook-id']}: {event_type}")

    if event_type == "issue.triggered":
        print(f"Issue triggered: {issue.get('id')} {issue.get('severity')} {issue.get('checkKind')} - {issue.get('description')}")
    elif event_type == "issue.escalated":
        print(f"Issue escalated: {issue.get('id')} {issue.get('severity')} {issue.get('checkKind')} on {server_name}")
    elif event_type == "issue.downgraded":
        print(f"Issue downgraded: {issue.get('id')} {issue.get('severity')} {issue.get('checkKind')} on {server_name}")
    elif event_type == "issue.acknowledged":
        print(f"Issue acknowledged: {issue.get('id')} {issue.get('checkKind')}")
    elif event_type == "issue.reopened":
        print(f"Issue reopened: {issue.get('id')} {issue.get('checkKind')}")
    elif event_type == "issue.resolved":
        print(f"Issue resolved: {issue.get('id')} {issue.get('checkKind')}")
    elif event_type == "ping":
        # Sent by "Test and Add" and "Send test": a test event, nothing to answer
        endpoint = data.get("endpoint") if isinstance(data.get("endpoint"), dict) else {}
        print(f"Ping received for endpoint: {endpoint.get('name')}")
    else:
        # The documented list may not be exhaustive: ignore what you don't need
        print(f"Unhandled event type: {event_type}")

    return {"received": True, "type": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
