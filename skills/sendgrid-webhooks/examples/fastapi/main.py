import os
import base64
import json
from datetime import datetime
from typing import List, Dict, Any
from fastapi import FastAPI, Header, Request, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.exceptions import InvalidSignature

# Load environment variables
load_dotenv()

app = FastAPI(title="SendGrid Webhook Handler")


def verify_signature(
    public_key_str: str,
    payload: bytes,
    signature: str,
    timestamp: str
) -> bool:
    """Verify SendGrid webhook signature using ECDSA"""
    try:
        # Decode the base64 signature
        decoded_signature = base64.b64decode(signature)

        # Create the signed content: timestamp + payload
        signed_content = (timestamp + payload.decode('utf-8')).encode('utf-8')

        # Add PEM headers if not present
        if not public_key_str.startswith('-----BEGIN'):
            public_key_pem = f"-----BEGIN PUBLIC KEY-----\n{public_key_str}\n-----END PUBLIC KEY-----"
        else:
            public_key_pem = public_key_str

        # Parse the public key
        public_key = serialization.load_pem_public_key(public_key_pem.encode())

        # Verify the signature
        public_key.verify(
            decoded_signature,
            signed_content,
            ec.ECDSA(hashes.SHA256())
        )
        return True
    except (InvalidSignature, Exception) as e:
        print(f"Signature verification failed: {e}")
        return False


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


@app.post("/webhooks/sendgrid")
async def handle_sendgrid_webhook(
    request: Request,
    x_twilio_email_event_webhook_signature: str = Header(None, alias="X-Twilio-Email-Event-Webhook-Signature"),
    x_twilio_email_event_webhook_timestamp: str = Header(None, alias="X-Twilio-Email-Event-Webhook-Timestamp")
):
    """Handle SendGrid webhook events"""

    # Check for lowercase headers as fallback
    if not x_twilio_email_event_webhook_signature:
        x_twilio_email_event_webhook_signature = request.headers.get("x-twilio-email-event-webhook-signature")
    if not x_twilio_email_event_webhook_timestamp:
        x_twilio_email_event_webhook_timestamp = request.headers.get("x-twilio-email-event-webhook-timestamp")

    # Validate required headers
    if not x_twilio_email_event_webhook_signature or not x_twilio_email_event_webhook_timestamp:
        raise HTTPException(status_code=400, detail="Missing signature headers")

    # Get public key from environment
    public_key = os.getenv("SENDGRID_WEBHOOK_VERIFICATION_KEY")
    if not public_key:
        raise HTTPException(status_code=500, detail="Webhook verification not configured")

    # Get raw payload - IMPORTANT: must be raw bytes for signature verification
    payload = await request.body()

    # Verify signature
    if not verify_signature(public_key, payload, x_twilio_email_event_webhook_signature, x_twilio_email_event_webhook_timestamp):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse JSON payload
    try:
        events = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Process each event
    print(f"Received {len(events)} SendGrid events")

    for event in events:
        event_time = datetime.fromtimestamp(event['timestamp']).isoformat()
        print(f"Event: {event['event']} for {event['email']} at {event_time}")

        # Handle specific event types
        match event.get('event'):
            case 'delivered':
                print(f"Email delivered to {event['email']}")
                # Update delivery status in your database
            case 'bounce':
                print(f"Email bounced for {event['email']}: {event.get('reason', 'Unknown')}")
                # Update your database to mark email as invalid
            case 'spam report':
                print(f"Spam report from {event['email']}")
                # Remove from mailing lists
            case 'unsubscribe':
                print(f"Unsubscribe from {event['email']}")
                # Update subscription preferences
            case 'open':
                print(f"Email opened by {event['email']}")
                # Track engagement metrics
            case 'click':
                print(f"Link clicked by {event['email']}: {event.get('url', 'Unknown')}")
                # Track click analytics
            case 'deferred':
                print(f"Email deferred for {event['email']}: {event.get('reason', 'Unknown')}")
                # Monitor delivery issues
            case 'dropped':
                print(f"Email dropped for {event['email']}: {event.get('reason', 'Unknown')}")
                # Investigate drop reasons
            case 'processed':
                print(f"Email processed for {event['email']}")
                # Track processing status
            case _:
                print(f"Unhandled event type: {event.get('event')}")

    # Return 200 to acknowledge receipt
    return JSONResponse(content={"status": "ok"}, status_code=200)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3000))
    uvicorn.run(app, host="0.0.0.0", port=port)