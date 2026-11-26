from fastapi import FastAPI, Header, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
import base64
import binascii
import secrets
from dotenv import load_dotenv
import logging
import json

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

class Metadata(BaseModel):
    request_id: str
    created: str
    duration: float
    channels: int
    model_info: Optional[Dict[str, Any]] = None
    extra: Optional[Dict[str, Any]] = None  # values passed with extra=KEY:VALUE

# The callback body is the /v1/listen response: { metadata, results }
class DeepgramWebhook(BaseModel):
    metadata: Metadata
    results: Results

def _safe_equal(a: str, b: str) -> bool:
    """Timing-safe string comparison"""
    return secrets.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_basic_auth(authorization: Optional[str]) -> bool:
    """Primary check: Basic Auth credentials embedded in the callback URL
    (https://user:pass@your-domain.com/webhooks/deepgram). Deepgram includes
    them when it sends the result; they arrive as an Authorization: Basic header"""
    username = os.environ.get("DEEPGRAM_CALLBACK_USERNAME")
    password = os.environ.get("DEEPGRAM_CALLBACK_PASSWORD")
    if not username or not password:
        return False  # fail closed if unconfigured
    if not authorization or not authorization.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(authorization[6:], validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return False
    user, sep, pwd = decoded.partition(":")  # password may itself contain ':'
    if not sep:
        return False
    return _safe_equal(user, username) and _safe_equal(pwd, password)

# Dependency for webhook verification
async def verify_deepgram_webhook(
    authorization: Optional[str] = Header(None),
):
    """Verify Deepgram webhook authentication"""
    if not verify_basic_auth(authorization):
        raise HTTPException(status_code=401, detail="Invalid Basic Auth credentials")
    return True

@app.post("/webhooks/deepgram")
async def handle_deepgram_webhook(
    request: Request,
    authenticated: bool = Depends(verify_deepgram_webhook)
):
    """Handle Deepgram webhook callbacks"""
    try:
        # Get raw body first (for potential future signature verification)
        raw_body = await request.body()

        # Parse the JSON body
        webhook_data = json.loads(raw_body)
    except Exception as e:
        logger.error(f"Error parsing webhook: {e}")
        raise HTTPException(status_code=400, detail="Invalid webhook payload")

    # Optional STT check: if you send extra=callback_secret:VALUE with each
    # /v1/listen request, Deepgram returns it in metadata.extra.callback_secret.
    # (dg-token is no longer a supported way to verify callbacks.)
    callback_secret = os.environ.get("DEEPGRAM_CALLBACK_SECRET")
    if callback_secret:
        metadata = webhook_data.get("metadata") if isinstance(webhook_data, dict) else None
        extra = (metadata or {}).get("extra") or {}
        received = extra.get("callback_secret")
        if not isinstance(received, str) or not _safe_equal(received, callback_secret):
            raise HTTPException(status_code=401, detail="Invalid callback secret")

    try:

        # Validate with Pydantic model
        webhook = DeepgramWebhook(**webhook_data)

        # Extract key information
        request_id = webhook.metadata.request_id
        created = webhook.metadata.created
        duration = webhook.metadata.duration
        extra = webhook.metadata.extra

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
        logger.info(f"Extra: {extra}")
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