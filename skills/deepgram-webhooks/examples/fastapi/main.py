from fastapi import FastAPI, Header, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Deepgram Webhook Handler")

# Models for type hints
class TranscriptionAlternative(BaseModel):
    transcript: str
    confidence: float
    words: Optional[List[Dict[str, Any]]] = None

class Channel(BaseModel):
    alternatives: List[TranscriptionAlternative]

class Results(BaseModel):
    channels: List[Channel]

class DeepgramWebhook(BaseModel):
    request_id: str
    created: str
    duration: float
    channels: int
    model_info: Optional[Dict[str, Any]] = None
    results: Results
    metadata: Optional[Dict[str, Any]] = None

# Dependency for webhook verification
async def verify_deepgram_webhook(dg_token: Optional[str] = Header(None, alias="dg-token")):
    """Verify Deepgram webhook authentication"""
    expected_token = os.environ.get("DEEPGRAM_API_KEY_ID")

    if not dg_token:
        raise HTTPException(status_code=401, detail="Missing dg-token header")

    if not expected_token:
        raise HTTPException(status_code=500, detail="DEEPGRAM_API_KEY_ID not configured")

    if dg_token != expected_token:
        raise HTTPException(status_code=403, detail="Invalid dg-token")

    return True

@app.post("/webhooks/deepgram")
async def handle_deepgram_webhook(
    webhook: DeepgramWebhook,
    request: Request,
    authenticated: bool = Depends(verify_deepgram_webhook)
):
    """Handle Deepgram webhook callbacks"""
    try:
        # Extract key information
        request_id = webhook.request_id
        created = webhook.created
        duration = webhook.duration

        # Get the transcript from the first channel and alternative
        transcript = ""
        confidence = 0.0

        if webhook.results.channels:
            first_channel = webhook.results.channels[0]
            if first_channel.alternatives:
                first_alternative = first_channel.alternatives[0]
                transcript = first_alternative.transcript
                confidence = first_alternative.confidence

        logger.info(f"Webhook received: {request_id}")
        logger.info(f"Created: {created}")
        logger.info(f"Duration: {duration}s")
        logger.info(f"Transcript preview: {transcript[:100]}...")
        logger.info(f"Confidence: {confidence}")

        # Process the transcription as needed
        # For example: save to database, trigger notifications, etc.

        # Return success to prevent retries
        return JSONResponse(
            status_code=200,
            content={
                "status": "success",
                "requestId": request_id
            }
        )

    except Exception as e:
        logger.error(f"Error processing webhook: {e}")
        raise HTTPException(status_code=400, detail="Invalid webhook payload")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)