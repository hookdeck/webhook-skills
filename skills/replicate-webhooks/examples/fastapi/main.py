import os
import hmac
import hashlib
import base64
import time
import json
import logging
from typing import Optional, Dict, Any
from datetime import datetime

from fastapi import FastAPI, Request, Response, Header, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Replicate Webhook Handler")


def verify_replicate_signature(
    body: bytes,
    webhook_id: str,
    webhook_timestamp: str,
    webhook_signature: str,
    secret: str
) -> bool:
    """Verify Replicate webhook signature."""
    try:
        # Extract the key from the secret (remove 'whsec_' prefix)
        key = base64.b64decode(secret.split('_')[1])

        # Create the signed content
        signed_content = f"{webhook_id}.{webhook_timestamp}.{body.decode()}"

        # Calculate expected signature
        expected_signature = base64.b64encode(
            hmac.new(key, signed_content.encode(), hashlib.sha256).digest()
        ).decode()

        # Parse signatures (can be multiple, space-separated)
        signatures = []
        for sig in webhook_signature.split(' '):
            # Handle format: v1,signature
            parts = sig.split(',')
            signatures.append(parts[1] if len(parts) > 1 else sig)

        # Verify at least one signature matches (timing-safe)
        for sig in signatures:
            if hmac.compare_digest(sig, expected_signature):
                # Verify timestamp is recent (prevent replay attacks)
                timestamp = int(webhook_timestamp)
                current_time = int(time.time())
                if current_time - timestamp > 300:  # 5 minutes
                    raise ValueError("Timestamp too old")
                return True

        return False

    except Exception as e:
        logger.error(f"Signature verification error: {e}")
        raise


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "Replicate webhook handler running"}


@app.post("/webhooks/replicate")
async def handle_replicate_webhook(
    request: Request,
    webhook_id: Optional[str] = Header(None, alias="webhook-id"),
    webhook_timestamp: Optional[str] = Header(None, alias="webhook-timestamp"),
    webhook_signature: Optional[str] = Header(None, alias="webhook-signature"),
):
    """Handle incoming Replicate webhooks."""
    start_time = time.time()

    # Verify required headers
    if not all([webhook_id, webhook_timestamp, webhook_signature]):
        logger.warning("Missing required webhook headers")
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Get raw body
    body = await request.body()

    # Verify webhook signature
    secret = os.getenv("REPLICATE_WEBHOOK_SECRET")
    if not secret:
        logger.error("REPLICATE_WEBHOOK_SECRET not configured")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    try:
        is_valid = verify_replicate_signature(
            body,
            webhook_id,
            webhook_timestamp,
            webhook_signature,
            secret
        )
    except ValueError as e:
        if "Timestamp too old" in str(e):
            logger.warning("Webhook timestamp too old")
            raise HTTPException(status_code=400, detail="Webhook timestamp too old")
        raise HTTPException(status_code=400, detail="Invalid webhook")
    except Exception:
        logger.exception("Signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid webhook")

    if not is_valid:
        logger.warning("Invalid webhook signature")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the verified webhook body
    try:
        prediction = json.loads(body.decode())
    except json.JSONDecodeError:
        logger.error("Invalid JSON in webhook body")
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Log the prediction
    logger.info(f"Received prediction webhook", extra={
        "id": prediction.get("id"),
        "status": prediction.get("status"),
        "version": prediction.get("version"),
        "timestamp": datetime.utcnow().isoformat()
    })

    # Handle the prediction based on its status
    status = prediction.get("status")

    if status == "starting":
        logger.info("Prediction starting", extra={
            "id": prediction.get("id"),
            "input": prediction.get("input"),
            "created_at": prediction.get("created_at")
        })
        # TODO: Update your database, notify users, etc.

    elif status == "processing":
        logs = prediction.get("logs", "")
        logger.info("Prediction processing", extra={
            "id": prediction.get("id"),
            "logs": f"{len(logs)} log entries" if logs else "no logs yet"
        })
        # TODO: Store or display logs

    elif status == "succeeded":
        output = prediction.get("output")
        logger.info("Prediction succeeded", extra={
            "id": prediction.get("id"),
            "output": f"Array with {len(output)} items" if isinstance(output, list) else type(output).__name__,
            "duration": prediction.get("metrics", {}).get("predict_time"),
            "urls": prediction.get("urls")
        })
        # TODO: Process and store the output, send notifications, etc.

    elif status == "failed":
        logger.info("Prediction failed", extra={
            "id": prediction.get("id"),
            "error": prediction.get("error")
        })
        # TODO: Handle error, notify users, etc.

    elif status == "canceled":
        logger.info("Prediction canceled", extra={
            "id": prediction.get("id")
        })
        # TODO: Clean up resources, notify users, etc.

    else:
        logger.warning(f"Unknown prediction status: {status}")

    # Process the event (add your business logic here)
    # For example:
    # - Update database with prediction status
    # - Notify users about completion
    # - Process and store the output

    processing_time = (time.time() - start_time) * 1000  # ms
    return JSONResponse(
        content={
            "received": True,
            "predictionStatus": status,
            "processingTime": f"{processing_time:.2f}ms"
        }
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions consistently."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail}
    )


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))

    logger.info(f"Starting Replicate webhook handler on {host}:{port}")
    logger.info(f"Webhook endpoint: http://localhost:{port}/webhooks/replicate")

    if not os.getenv("REPLICATE_WEBHOOK_SECRET"):
        logger.warning("⚠️  REPLICATE_WEBHOOK_SECRET not set in environment variables")

    uvicorn.run(app, host=host, port=port)