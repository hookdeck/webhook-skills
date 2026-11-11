import os
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, Header
from elevenlabs import ElevenLabs
from elevenlabs.errors import BadRequestError
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

# The API key is only needed for ElevenLabs API calls, not for webhook verification
elevenlabs = ElevenLabs(api_key=os.getenv('ELEVENLABS_API_KEY') or 'webhook-only')


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
        raise HTTPException(status_code=401, detail="Missing signature header")

    # Get raw body
    raw_body = await request.body()

    try:
        # Verify the signature and timestamp (30-minute tolerance) and parse the event.
        # construct_event needs the raw body as a str, so decode the bytes first.
        event = elevenlabs.webhooks.construct_event(
            raw_body.decode('utf-8'),
            elevenlabs_signature,
            WEBHOOK_SECRET
        )

        logger.info(f"Received ElevenLabs webhook: {event['type']}")

        # Process based on event type
        if event['type'] == 'post_call_transcription':
            # Handle call transcription completion
            logger.info(f"Call transcription completed: {event['data'].get('call_id')}")
            # Add your business logic here

        elif event['type'] == 'voice_removal_notice':
            # Handle voice removal notice
            logger.info(f"Voice removal notice received: {event['data']}")
            # Add logic to handle voice removal notice

        elif event['type'] == 'voice_removal_notice_withdrawn':
            # Handle voice removal notice withdrawal
            logger.info(f"Voice removal notice withdrawn: {event['data']}")
            # Add logic to handle notice withdrawal

        elif event['type'] == 'voice_removed':
            # Handle voice removal completion
            logger.info(f"Voice removed: {event['data']}")
            # Add logic to handle voice removal completion

        else:
            logger.info(f"Unknown event type: {event['type']}")

        # Return 200 to acknowledge receipt
        return {"status": "ok"}

    except BadRequestError as e:
        logger.error(f"Webhook verification failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    except Exception as e:
        logger.error(f"Webhook processing failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)