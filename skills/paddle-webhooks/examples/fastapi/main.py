import os
import hmac
import hashlib
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

webhook_secret = os.environ.get("PADDLE_WEBHOOK_SECRET")

# Initialize Paddle SDK Verifier if available
# The Python SDK uses a Verifier class for webhook signature verification
verifier = None
try:
    from paddle_billing.Notifications import Secret, Verifier
    verifier = Verifier()
except ImportError:
    pass  # SDK not installed, use manual verification


def verify_paddle_signature(payload: str, signature_header: str, secret: str) -> bool:
    """
    Verify Paddle webhook signature.

    Args:
        payload: Raw request body as string
        signature_header: Paddle-Signature header value
        secret: Webhook secret key

    Returns:
        bool: Whether signature is valid
    """
    if not signature_header:
        return False

    try:
        # Parse the signature header (format: ts=1234567890;h1=abc123...)
        parts = signature_header.split(";")
        timestamp = None
        signatures = []

        for part in parts:
            if part.startswith("ts="):
                timestamp = part[3:]
            elif part.startswith("h1="):
                signatures.append(part[3:])

        if not timestamp or not signatures:
            return False

        # Build the signed payload (timestamp:rawBody)
        signed_payload = f"{timestamp}:{payload}"

        # Compute the expected signature
        expected_signature = hmac.new(
            secret.encode(), signed_payload.encode(), hashlib.sha256
        ).hexdigest()

        # Check if any signature matches (handles secret rotation)
        return any(hmac.compare_digest(sig, expected_signature) for sig in signatures)
    except Exception as e:
        print(f"Error verifying signature: {e}")
        return False


@app.post("/webhooks/paddle")
async def paddle_webhook(request: Request):
    # Get the raw body for signature verification
    payload = await request.body()
    payload_str = payload.decode()
    signature_header = request.headers.get("paddle-signature")

    if not signature_header:
        raise HTTPException(status_code=400, detail="Missing Paddle-Signature header")

    # Option 1: Verify using Paddle SDK (recommended if SDK is available)
    # The Python SDK uses Verifier().verify(request, Secret(secret)) pattern
    if verifier and webhook_secret:
        try:
            # Import Secret for this verification
            from paddle_billing.Notifications import Secret
            # The SDK's verify() method accepts a request-like object and returns bool
            # Note: For FastAPI, we need to create a compatible request object
            # Since Verifier expects specific request attributes, we use manual verification
            # as the more reliable option for FastAPI
            is_valid = verify_paddle_signature(payload_str, signature_header, webhook_secret)
            if not is_valid:
                print("Webhook signature verification failed")
                raise HTTPException(status_code=400, detail="Invalid signature")
            print("Webhook verified using manual verification (SDK available but FastAPI requires manual)")
        except ImportError:
            # Fallback to manual if import fails
            if not verify_paddle_signature(payload_str, signature_header, webhook_secret):
                print("Manual webhook signature verification failed")
                raise HTTPException(status_code=400, detail="Invalid signature")
            print("Webhook verified using manual verification")
    else:
        # Option 2: Manual verification (when SDK is not available)
        if not verify_paddle_signature(payload_str, signature_header, webhook_secret):
            print("Manual webhook signature verification failed")
            raise HTTPException(status_code=400, detail="Invalid signature")
        print("Webhook verified using manual verification")

    # Parse the event
    try:
        event = await request.json()
    except Exception as e:
        print(f"Failed to parse webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Handle the event based on type
    event_type = event.get("event_type")
    data = event.get("data", {})

    if event_type == "subscription.created":
        print(f"Subscription created: {data.get('id')}")
        # TODO: Provision access, send welcome email, etc.

    elif event_type == "subscription.activated":
        print(f"Subscription activated: {data.get('id')}")
        # TODO: Grant full access after first payment

    elif event_type == "subscription.canceled":
        print(f"Subscription canceled: {data.get('id')}")
        # TODO: Revoke access, send retention email, etc.

    elif event_type == "subscription.paused":
        print(f"Subscription paused: {data.get('id')}")
        # TODO: Limit access, send pause confirmation

    elif event_type == "subscription.resumed":
        print(f"Subscription resumed: {data.get('id')}")
        # TODO: Restore access, send welcome back email

    elif event_type == "transaction.completed":
        print(f"Transaction completed: {data.get('id')}")
        # TODO: Fulfill order, send receipt, etc.

    elif event_type == "transaction.payment_failed":
        print(f"Transaction payment failed: {data.get('id')}")
        # TODO: Notify customer, update status, etc.

    elif event_type == "customer.created":
        print(f"Customer created: {data.get('id')}")
        # TODO: Create customer record, send welcome email, etc.

    elif event_type == "customer.updated":
        print(f"Customer updated: {data.get('id')}")
        # TODO: Update customer record, sync changes, etc.

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 200 to acknowledge receipt (respond within 5 seconds)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
