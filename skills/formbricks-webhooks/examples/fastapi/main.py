# Generated with: formbricks-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook

load_dotenv()

app = FastAPI(title="Formbricks Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def read_signature_headers(headers):
    """Formbricks sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent."""
    prefix = "webhook" if headers.get("webhook-id") else "svix"
    return {
        "webhook-id": headers.get(f"{prefix}-id"),
        "webhook-timestamp": headers.get(f"{prefix}-timestamp"),
        "webhook-signature": headers.get(f"{prefix}-signature"),
    }


@app.post("/webhooks/formbricks")
async def formbricks_webhook(request: Request):
    secret = os.environ.get("FORMBRICKS_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("FORMBRICKS_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    sig_headers = read_signature_headers(request.headers)
    if not all(sig_headers.values()):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Formbricks signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # A malformed signature entry raises ValueError rather than WebhookVerificationError, so catch Exception.
        Webhook(secret).verify(raw_body, sig_headers, json_parse=False)
    except Exception as err:
        print(f"Formbricks webhook verification failed: {err}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The body is { event, data, webhookId }: `event` names the trigger, `data` is the response
    # (answers are in data.data, a summary of the survey in data.survey)
    event_type = event.get("event")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    # webhook-id is stable across retries and the body has no event id: use it to deduplicate
    print(f"Received Formbricks webhook {sig_headers['webhook-id']}: {event_type}")

    if event_type == "responseCreated":
        print(f"Response created: {data.get('id')} survey {data.get('surveyId')}")
    elif event_type == "responseUpdated":
        print(f"Response updated: {data.get('id')} survey {data.get('surveyId')}")
    elif event_type == "responseFinished":
        print(f"Response finished: {data.get('id')} survey {data.get('surveyId')}")
    else:
        # The documented list may not be exhaustive: ignore what you don't need
        print(f"Unhandled event type: {event_type}")

    return {"received": True, "event": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
