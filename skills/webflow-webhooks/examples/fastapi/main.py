import os
import hmac
import hashlib
import time
import json
from typing import Optional
from fastapi import FastAPI, Request, HTTPException, Depends, Header
from fastapi.responses import Response
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(title="Webflow Webhook Handler")

def get_webhook_secret() -> str:
    """Get webhook secret from environment at request time."""
    return os.getenv("WEBFLOW_WEBHOOK_SECRET", "")


def verify_webflow_signature(
    raw_body: bytes,
    signature: str,
    timestamp: str,
    secret: str
) -> bool:
    """Verify Webflow webhook signature"""

    # Validate timestamp to prevent replay attacks (5-minute window)
    try:
        webhook_time = int(timestamp)
    except ValueError:
        return False

    current_time = int(time.time() * 1000)
    time_diff = abs(current_time - webhook_time)

    if time_diff > 300000:  # 5 minutes = 300000 milliseconds
        return False

    # Create signed content: timestamp:body
    signed_content = f"{timestamp}:{raw_body.decode('utf-8')}"

    # Generate expected signature
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        signed_content.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature, expected_signature)


async def validate_webhook_signature(
    request: Request,
    x_webflow_signature: Optional[str] = Header(None),
    x_webflow_timestamp: Optional[str] = Header(None)
) -> bytes:
    """FastAPI dependency to validate webhook signature"""

    # Check required headers
    if not x_webflow_signature or not x_webflow_timestamp:
        raise HTTPException(status_code=400, detail="Missing required headers")

    # Check webhook secret
    secret = get_webhook_secret()
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Get raw body
    raw_body = await request.body()

    # Verify signature
    is_valid = verify_webflow_signature(
        raw_body,
        x_webflow_signature,
        x_webflow_timestamp,
        secret
    )

    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid signature")

    return raw_body


@app.post("/webhooks/webflow")
async def handle_webhook(raw_body: bytes = Depends(validate_webhook_signature)):
    """Handle Webflow webhooks with signature verification"""

    # Parse the verified payload
    try:
        event = json.loads(raw_body.decode('utf-8'))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Log the event
    print(f"Received Webflow webhook: {event.get('triggerType')}")

    # Handle different event types
    trigger_type = event.get('triggerType')
    payload = event.get('payload', {})

    if trigger_type == 'form_submission':
        print(f"Form submission: {payload.get('name')}")
        print(f"Form data: {payload.get('data')}")
        # Add your form submission handling logic here

    elif trigger_type == 'ecomm_new_order':
        print(f"New order: {payload.get('orderId')}")
        print(f"Total: {payload.get('total')} {payload.get('currency')}")
        # Add your order processing logic here

    elif trigger_type == 'collection_item_created':
        print(f"New CMS item: {payload.get('name')}")
        print(f"Collection: {payload.get('_cid')}")
        # Add your CMS sync logic here

    elif trigger_type == 'collection_item_changed':
        print(f"CMS item updated: {payload.get('name')}")

    elif trigger_type == 'collection_item_deleted':
        print(f"CMS item deleted: {payload.get('_id')}")

    elif trigger_type == 'site_publish':
        print("Site published")
        # Add cache clearing or build trigger logic here

    elif trigger_type == 'user_account_added':
        print(f"New user account: {payload.get('userId')}")

    else:
        print(f"Unhandled event type: {trigger_type}")

    # Always return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": int(time.time())
    }


@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "name": "Webflow Webhook Handler",
        "endpoints": {
            "webhook": "POST /webhooks/webflow",
            "health": "GET /health",
            "docs": "GET /docs"
        }
    }


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 3000))

    print(f"Starting Webflow webhook handler on {host}:{port}")
    print(f"Webhook endpoint: POST http://{host}:{port}/webhooks/webflow")

    uvicorn.run(app, host=host, port=port)