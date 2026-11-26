import os
import hmac
import hashlib
import time
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import JSONResponse
import logging

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Get webhook secret from environment
WEBHOOK_SECRET = os.getenv('ELEVENLABS_WEBHOOK_SECRET', '')

if not WEBHOOK_SECRET:
    logger.warning("ELEVENLABS_WEBHOOK_SECRET not set!")


def verify_elevenlabs_webhook(
    raw_body: bytes,
    signature_header: str,
    secret: str
) -> bool:
    """
    Verify ElevenLabs webhook signature
    Referenced from elevenlabs-webhooks skill
    """
    if not signature_header:
        raise ValueError('No signature header provided')

    # Parse the signature header: "t=timestamp,v0=signature"
    elements = signature_header.split(',')
    timestamp = None
    signatures = []

    for element in elements:
        if element.startswith('t='):
            timestamp = element[2:]
        elif element.startswith('v0='):
            signatures.append(element[3:])

    if not timestamp or not signatures:
        raise ValueError('Invalid signature header format')

    # Verify timestamp is within tolerance (30 minutes)
    current_time = int(time.time())
    timestamp_age = abs(current_time - int(timestamp))

    if timestamp_age > 1800:
        raise ValueError('Webhook timestamp too old')

    # Create the signed payload
    signed_payload = f"{timestamp}.{raw_body.decode('utf-8')}"

    # Calculate expected signature
    expected_signature = hmac.new(
        secret.encode(),
        signed_payload.encode(),
        hashlib.sha256
    ).hexdigest()

    # Timing-safe comparison
    is_valid = any(
        hmac.compare_digest(sig, expected_signature)
        for sig in signatures
    )

    if not is_valid:
        raise ValueError('Invalid webhook signature')

    return True


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


@app.post("/webhooks/elevenlabs")
async def elevenlabs_webhook(
    request: Request,
    elevenlabs_signature: Optional[str] = Header(None, alias="ElevenLabs-Signature")
):
    """Handle ElevenLabs webhooks"""

    # Try both header cases
    if not elevenlabs_signature:
        elevenlabs_signature = request.headers.get('elevenlabs-signature')

    if not elevenlabs_signature:
        raise HTTPException(status_code=400, detail="Missing signature header")

    # Get raw body
    raw_body = await request.body()

    try:
        # Verify webhook signature
        verify_elevenlabs_webhook(
            raw_body,
            elevenlabs_signature,
            WEBHOOK_SECRET
        )

        # Parse the webhook payload
        import json
        event = json.loads(raw_body)

        logger.info(f"Received ElevenLabs webhook: {event['type']}")

        # Process based on event type
        if event['type'] == 'post_call_transcription':
            # Call ended and analysis is complete
            logger.info(f"Call transcription completed: {event['data'].get('conversation_id')}")
            # Your code: store event['data']['transcript'] and event['data']['analysis']

        elif event['type'] == 'post_call_audio':
            # Full call audio as base64-encoded MP3 in event['data']['full_audio']
            logger.info(f"Call audio ready: {event['data'].get('conversation_id')}")

        elif event['type'] == 'call_initiation_failure':
            # Phone call didn't connect: failure_reason is busy, no-answer or unknown
            logger.info(f"Call initiation failed: {event['data'].get('failure_reason')}")

        elif event['type'] == 'voice_removal_notice':
            # Handle voice removal notice
            logger.info(f"Voice removal notice received: {event['data']}")
            # Your code: switch to one of event['data']['suggested_voices']

        elif event['type'] == 'voice_removal_notice_withdrawn':
            # Handle voice removal notice withdrawal
            logger.info(f"Voice removal notice withdrawn: {event['data']}")
            # Your code: keep using event['data']['voice_id']

        elif event['type'] == 'voice_removed':
            # Handle voice removal completion
            logger.info(f"Voice removed: {event['data']}")
            # Your code: stop using event['data']['voice_id']

        else:
            logger.info(f"Unknown event type: {event['type']}")

        # Return 200 to acknowledge receipt
        return {"status": "ok"}

    except ValueError as e:
        logger.error(f"Webhook verification failed: {str(e)}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    except Exception as e:
        logger.error(f"Webhook processing failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)