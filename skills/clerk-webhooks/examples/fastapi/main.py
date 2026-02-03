# Generated with: clerk-webhooks skill
# https://github.com/hookdeck/webhook-skills

import os
import hmac
import hashlib
import base64
import json
from time import time
from typing import Dict, Any

from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(title="Clerk Webhook Handler")


def verify_clerk_signature(
    body: bytes,
    svix_id: str,
    svix_timestamp: str,
    svix_signature: str,
    secret: str
) -> bool:
    """Verify Clerk webhook signature using Svix headers."""
    try:
        # Construct the signed content
        signed_content = f"{svix_id}.{svix_timestamp}.{body.decode()}"

        # Extract the base64 secret (everything after 'whsec_')
        secret_bytes = base64.b64decode(secret.split('_')[1])

        # Calculate expected signature
        expected_signature = base64.b64encode(
            hmac.new(secret_bytes, signed_content.encode(), hashlib.sha256).digest()
        ).decode()

        # Svix can send multiple signatures separated by spaces
        # Each signature is in format "v1,actualSignature"
        signatures = [sig.split(',')[1] for sig in svix_signature.split(' ')]

        # Check if any signature matches
        return expected_signature in signatures

    except Exception:
        return False


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/webhooks/clerk")
async def clerk_webhook(
    request: Request,
    svix_id: str = Header(None),
    svix_timestamp: str = Header(None),
    svix_signature: str = Header(None)
):
    """Handle Clerk webhooks with signature verification."""

    # Verify required headers are present
    if not all([svix_id, svix_timestamp, svix_signature]):
        raise HTTPException(
            status_code=400,
            detail="Missing required Svix headers"
        )

    # Get raw body
    body = await request.body()

    # Get webhook secret
    secret = os.environ.get("CLERK_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("Invalid webhook secret configuration")
        raise HTTPException(
            status_code=500,
            detail="Server configuration error"
        )

    # Verify signature
    if not verify_clerk_signature(body, svix_id, svix_timestamp, svix_signature, secret):
        raise HTTPException(
            status_code=400,
            detail="Invalid signature"
        )

    # Check timestamp to prevent replay attacks (5 minute window)
    try:
        timestamp = int(svix_timestamp)
        current_time = int(time())
        if current_time - timestamp > 300:  # 5 minutes
            raise HTTPException(
                status_code=400,
                detail="Timestamp too old"
            )
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid timestamp"
        )

    # Parse the verified event
    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Invalid JSON payload"
        )

    # Handle different event types
    event_type = event.get("type", "unknown")
    event_data = event.get("data", {})

    print(f"Received Clerk webhook: {event_type}")

    # Process based on event type
    if event_type == "user.created":
        print(f"New user created: {event_data.get('id')}")
        email = None
        if email_addresses := event_data.get("email_addresses"):
            email = email_addresses[0].get("email_address") if email_addresses else None
        print(f"Email: {email}")
        # TODO: Add your user creation logic here

    elif event_type == "user.updated":
        print(f"User updated: {event_data.get('id')}")
        # TODO: Add your user update logic here

    elif event_type == "user.deleted":
        print(f"User deleted: {event_data.get('id')}")
        # TODO: Add your user deletion logic here

    elif event_type == "session.created":
        print(f"Session created: {event_data.get('id')}")
        print(f"User ID: {event_data.get('user_id')}")
        # TODO: Add your session creation logic here

    elif event_type == "session.ended":
        print(f"Session ended: {event_data.get('id')}")
        print(f"User ID: {event_data.get('user_id')}")
        # TODO: Add your session end logic here

    elif event_type == "organization.created":
        print(f"Organization created: {event_data.get('id')}")
        print(f"Name: {event_data.get('name')}")
        # TODO: Add your organization creation logic here

    else:
        print(f"Unhandled event type: {event_type}")

    # Return success response
    return JSONResponse(
        content={"success": True, "type": event_type},
        status_code=200
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)