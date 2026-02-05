import os
import hmac
import hashlib
import json
from typing import Optional
from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()


def verify_cursor_webhook(body: bytes, signature_header: str, secret: str) -> bool:
    """Verify Cursor webhook signature."""
    if not signature_header or not secret:
        return False

    # Cursor sends: sha256=xxxx
    parts = signature_header.split('=')
    if len(parts) != 2 or parts[0] != 'sha256':
        return False

    signature = parts[1]
    expected = hmac.new(
        secret.encode(),
        body,
        hashlib.sha256
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature, expected)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/webhooks/cursor")
async def handle_cursor_webhook(
    request: Request,
    x_webhook_signature: Optional[str] = Header(None),
    x_webhook_id: Optional[str] = Header(None),
    x_webhook_event: Optional[str] = Header(None),
    user_agent: Optional[str] = Header(None)
):
    """Handle Cursor webhook."""
    logger.info(f"Received webhook: {x_webhook_event} (ID: {x_webhook_id})")

    # Get raw body for signature verification
    body = await request.body()

    # Verify signature
    secret = os.getenv('CURSOR_WEBHOOK_SECRET')
    if not secret:
        logger.error("CURSOR_WEBHOOK_SECRET not configured")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not verify_cursor_webhook(body, x_webhook_signature, secret):
        logger.error("Signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload after verification
    try:
        payload = json.loads(body.decode())
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Handle the event
    if x_webhook_event == 'statusChange':
        agent_id = payload.get('id')
        status = payload.get('status')
        timestamp = payload.get('timestamp')

        logger.info(f"Agent {agent_id} status changed to: {status}")
        logger.info(f"Timestamp: {timestamp}")

        if 'source' in payload:
            logger.info(f"Repository: {payload['source'].get('repository')}")
            logger.info(f"Ref: {payload['source'].get('ref')}")

        if 'target' in payload:
            logger.info(f"Target URL: {payload['target'].get('url')}")
            logger.info(f"Branch: {payload['target'].get('branchName')}")
            if 'prUrl' in payload['target']:
                logger.info(f"PR URL: {payload['target']['prUrl']}")

        if status == 'FINISHED':
            logger.info(f"Summary: {payload.get('summary')}")
            # Handle successful completion
            # e.g., update database, notify users, trigger CI/CD
        elif status == 'ERROR':
            logger.error(f"Agent error for {agent_id}")
            # Handle error case
            # e.g., send alerts, retry logic

    # Always respond quickly to webhooks
    return JSONResponse(content={"received": True})


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle unexpected errors."""
    logger.error(f"Webhook error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"}
    )


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))

    if not os.getenv("CURSOR_WEBHOOK_SECRET"):
        logger.warning("WARNING: CURSOR_WEBHOOK_SECRET not set. Webhooks will fail verification.")

    uvicorn.run(app, host=host, port=port)