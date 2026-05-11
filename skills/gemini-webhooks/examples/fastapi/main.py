# Generated with: gemini-webhooks skill
# https://github.com/hookdeck/webhook-skills

import os
import hmac
import hashlib
import json
import base64
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, Header

load_dotenv()

app = FastAPI(title="Gemini Webhook Handler")


def verify_gemini_signature(
    payload: bytes,
    webhook_id: Optional[str],
    webhook_timestamp: Optional[str],
    webhook_signature: Optional[str],
    secret: str,
) -> bool:
    """
    Verify a Gemini webhook signature (Standard Webhooks, HMAC-SHA256).
    """
    if not webhook_id or not webhook_timestamp or not webhook_signature or "," not in webhook_signature:
        return False

    # Reject payloads older than 5 minutes (Standard Webhooks default)
    try:
        timestamp_diff = int(time.time()) - int(webhook_timestamp)
    except ValueError:
        return False
    if timestamp_diff > 300 or timestamp_diff < -300:
        print(f"Webhook timestamp too old or too far in the future: {timestamp_diff}s difference")
        return False

    # Signed content: webhook_id.webhook_timestamp.raw_body
    signed_content = f"{webhook_id}.{webhook_timestamp}.{payload.decode('utf-8')}"

    secret_key = secret[6:] if secret.startswith("whsec_") else secret
    try:
        secret_bytes = base64.b64decode(secret_key)
    except Exception:
        return False

    expected_signature = base64.b64encode(
        hmac.new(secret_bytes, signed_content.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8")

    # Standard Webhooks allows space-separated entries during secret rotation:
    # `v1,<sig1> v1,<sig2>`. Accept the message if any v1 entry matches.
    for part in webhook_signature.split(" "):
        if "," not in part:
            continue
        version, _, signature = part.partition(",")
        if version != "v1":
            continue
        if hmac.compare_digest(signature, expected_signature):
            return True
    return False


@app.post("/webhooks/gemini")
async def gemini_webhook(
    request: Request,
    webhook_id: Optional[str] = Header(None, alias="webhook-id"),
    webhook_timestamp: Optional[str] = Header(None, alias="webhook-timestamp"),
    webhook_signature: Optional[str] = Header(None, alias="webhook-signature"),
):
    """
    Receive and process Google Gemini API webhooks.
    """
    payload = await request.body()
    webhook_secret = os.environ.get("GEMINI_WEBHOOK_SECRET")

    if not webhook_secret:
        print("ERROR: GEMINI_WEBHOOK_SECRET environment variable not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    if not verify_gemini_signature(payload, webhook_id, webhook_timestamp, webhook_signature, webhook_secret):
        print("ERROR: Gemini webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = event.get("type")
    event_data = event.get("data", {})

    if event_type == "batch.succeeded":
        print(f"Batch succeeded: {event_data.get('id')}")
        print(f"Output: {event_data.get('output_file_uri')}")
        # TODO: Download output, fan out results

    elif event_type == "batch.failed":
        print(f"Batch failed: {event_data.get('id')}")
        print(f"Error: {event_data.get('error_code')} {event_data.get('error_message')}")
        # TODO: Alert team, decide whether to retry

    elif event_type == "batch.cancelled":
        print(f"Batch cancelled: {event_data.get('id')}")
        # TODO: Clean up resources, update status

    elif event_type == "batch.expired":
        print(f"Batch expired: {event_data.get('id')}")
        # TODO: Resubmit or surface to user

    elif event_type == "video.generated":
        print(f"Video generated: {event_data.get('id')}")
        print(f"Video URI: {event_data.get('output_file_uri')}")
        print(f"File name: {event_data.get('file_name')}")
        # TODO: Fetch the rendered video, notify the user

    elif event_type == "interaction.completed":
        print(f"Interaction completed: {event_data.get('id')}")
        # TODO: Consume LRO result, continue flow

    elif event_type == "interaction.requires_action":
        print(f"Interaction requires action: {event_data.get('id')}")
        # TODO: Run the requested function call, submit the result back

    elif event_type == "interaction.failed":
        print(f"Interaction failed: {event_data.get('id')}")
        print(f"Error: {event_data.get('error_code')} {event_data.get('error_message')}")
        # TODO: Surface error to user

    elif event_type == "interaction.cancelled":
        print(f"Interaction cancelled: {event_data.get('id')}")
        # TODO: Update UI / state

    else:
        print(f"Unhandled event type: {event_type}")

    return {"received": True}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
