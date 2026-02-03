# Generated with: openai-webhooks skill
# https://github.com/hookdeck/webhook-skills

import os
import hmac
import hashlib
import json
import base64
import time
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, Header, Response

load_dotenv()

app = FastAPI(title="OpenAI Webhook Handler")


def verify_openai_signature(
    payload: bytes,
    webhook_id: Optional[str],
    webhook_timestamp: Optional[str],
    webhook_signature: Optional[str],
    secret: str
) -> bool:
    """
    Verify OpenAI webhook signature using Standard Webhooks

    Args:
        payload: Raw request body
        webhook_id: Value of webhook-id header
        webhook_timestamp: Value of webhook-timestamp header
        webhook_signature: Value of webhook-signature header
        secret: Webhook signing secret

    Returns:
        Whether signature is valid
    """
    if not webhook_id or not webhook_timestamp or not webhook_signature or ',' not in webhook_signature:
        return False

    # Check timestamp is within 5 minutes to prevent replay attacks
    current_time = int(time.time())
    try:
        timestamp_diff = current_time - int(webhook_timestamp)
        if timestamp_diff > 300 or timestamp_diff < -300:
            print(f"Webhook timestamp too old or too far in the future: {timestamp_diff}s difference")
            return False
    except ValueError:
        return False

    # Extract version and signature
    parts = webhook_signature.split(',', 1)
    if len(parts) != 2:
        return False

    version, signature = parts
    if version != 'v1':
        return False

    # Create signed content
    signed_content = f"{webhook_id}.{webhook_timestamp}.{payload.decode('utf-8')}"

    # Decode base64 secret (remove whsec_ prefix if present)
    secret_key = secret[6:] if secret.startswith('whsec_') else secret
    try:
        secret_bytes = base64.b64decode(secret_key)
    except Exception:
        return False

    # Generate expected signature
    expected_signature = base64.b64encode(
        hmac.new(
            secret_bytes,
            signed_content.encode('utf-8'),
            hashlib.sha256
        ).digest()
    ).decode('utf-8')

    # Timing-safe comparison to prevent timing attacks
    return hmac.compare_digest(signature, expected_signature)


@app.post("/webhooks/openai")
async def openai_webhook(
    request: Request,
    webhook_id: Optional[str] = Header(None, alias="webhook-id"),
    webhook_timestamp: Optional[str] = Header(None, alias="webhook-timestamp"),
    webhook_signature: Optional[str] = Header(None, alias="webhook-signature")
):
    """
    Receive and process OpenAI webhooks
    """
    # Get raw body for signature verification
    payload = await request.body()
    webhook_secret = os.environ.get("OPENAI_WEBHOOK_SECRET")

    if not webhook_secret:
        print("ERROR: OPENAI_WEBHOOK_SECRET environment variable not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Verify webhook signature
    if not verify_openai_signature(payload, webhook_id, webhook_timestamp, webhook_signature, webhook_secret):
        print("ERROR: OpenAI webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the verified payload
    try:
        event = json.loads(payload.decode('utf-8'))
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Handle the event based on type
    event_type = event.get("type")
    event_data = event.get("data", {})

    if event_type == "fine_tuning.job.succeeded":
        print(f"Fine-tuning job succeeded: {event_data.get('id')}")
        print(f"Fine-tuned model: {event_data.get('fine_tuned_model')}")
        # TODO: Deploy model, notify team, update database

    elif event_type == "fine_tuning.job.failed":
        print(f"Fine-tuning job failed: {event_data.get('id')}")
        error = event_data.get('error', {})
        print(f"Error: {error.get('message')}")
        # TODO: Alert team, log error, retry if appropriate

    elif event_type == "fine_tuning.job.cancelled":
        print(f"Fine-tuning job cancelled: {event_data.get('id')}")
        # TODO: Clean up resources, update status

    elif event_type == "batch.completed":
        print(f"Batch completed: {event_data.get('id')}")
        print(f"Output file: {event_data.get('output_file_id')}")
        # TODO: Download results, process output, trigger next steps

    elif event_type == "batch.failed":
        print(f"Batch failed: {event_data.get('id')}")
        print(f"Error: {event_data.get('errors')}")
        # TODO: Handle errors, retry failed items

    elif event_type == "batch.cancelled":
        print(f"Batch cancelled: {event_data.get('id')}")
        # TODO: Clean up resources, update status

    elif event_type == "batch.expired":
        print(f"Batch expired: {event_data.get('id')}")
        # TODO: Clean up resources, handle timeout

    elif event_type == "realtime.call.incoming":
        print(f"Realtime call incoming: {event_data.get('id')}")
        # TODO: Handle incoming call, connect client

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health_check():
    """
    Health check endpoint
    """
    return {"status": "ok"}


# Run the app
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)