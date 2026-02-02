import os
import base64
from typing import Optional, Dict, Any
from fastapi import FastAPI, Header, HTTPException, Depends, Response
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(title="Chargebee Webhook Handler")


def verify_chargebee_auth(authorization: Optional[str] = Header(None)) -> bool:
    """
    Verify Chargebee webhook Basic Auth
    """
    if not authorization or not authorization.startswith("Basic "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Decode Base64
    encoded = authorization[6:]
    try:
        decoded = base64.b64decode(encoded).decode('utf-8')
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid authorization encoding")

    # Split username:password (handle colons in password)
    if ':' not in decoded:
        raise HTTPException(status_code=401, detail="Invalid authorization format")

    colon_index = decoded.index(':')
    username = decoded[:colon_index]
    password = decoded[colon_index + 1:]

    # Verify credentials against environment variables
    expected_username = os.getenv("CHARGEBEE_WEBHOOK_USERNAME")
    expected_password = os.getenv("CHARGEBEE_WEBHOOK_PASSWORD")

    if not expected_username or not expected_password:
        print("ERROR: Missing CHARGEBEE_WEBHOOK_USERNAME or CHARGEBEE_WEBHOOK_PASSWORD environment variables")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if username != expected_username or password != expected_password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return True


@app.post("/webhooks/chargebee")
async def handle_chargebee_webhook(
    event: Dict[str, Any],
    auth_valid: bool = Depends(verify_chargebee_auth)
):
    """
    Handle Chargebee webhook events
    """
    # Extract event details
    event_id = event.get("id")
    event_type = event.get("event_type")
    occurred_at = event.get("occurred_at")

    # Log event details
    print(f"Received Chargebee webhook: id={event_id}, type={event_type}, occurred_at={occurred_at}")

    # Handle specific event types
    if event_type == "subscription_created":
        subscription = event.get("content", {}).get("subscription", {})
        print(f"New subscription created: {subscription.get('id')}")
        # TODO: Provision user access, send welcome email, etc.

    elif event_type == "subscription_changed":
        subscription = event.get("content", {}).get("subscription", {})
        print(f"Subscription updated: {subscription.get('id')}")
        # TODO: Update user permissions, sync subscription data

    elif event_type == "subscription_cancelled":
        subscription = event.get("content", {}).get("subscription", {})
        print(f"Subscription cancelled: {subscription.get('id')}")
        # TODO: Schedule access revocation, trigger retention flow

    elif event_type == "subscription_reactivated":
        subscription = event.get("content", {}).get("subscription", {})
        print(f"Subscription reactivated: {subscription.get('id')}")
        # TODO: Restore user access

    elif event_type == "payment_succeeded":
        transaction = event.get("content", {}).get("transaction", {})
        print(f"Payment succeeded: {transaction.get('id')}")
        # TODO: Update payment status, send receipt

    elif event_type == "payment_failed":
        transaction = event.get("content", {}).get("transaction", {})
        print(f"Payment failed: {transaction.get('id')}")
        # TODO: Send payment failure notification, retry logic

    elif event_type == "invoice_generated":
        invoice = event.get("content", {}).get("invoice", {})
        print(f"Invoice generated: {invoice.get('id')}")
        # TODO: Send invoice to customer

    elif event_type == "customer_created":
        customer = event.get("content", {}).get("customer", {})
        print(f"Customer created: {customer.get('id')}")
        # TODO: Create user account, sync customer data

    else:
        print(f"Unhandled event type: {event_type}")

    # Always return 200 to acknowledge receipt
    return {"status": "OK"}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


@app.get("/")
async def root():
    """Root endpoint with basic info"""
    return {
        "service": "Chargebee Webhook Handler",
        "webhook_endpoint": "/webhooks/chargebee",
        "docs": "/docs"
    }