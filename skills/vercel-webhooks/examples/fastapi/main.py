import os
import hmac
import hashlib
import logging
from typing import Dict, Any, Optional
from datetime import datetime

from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import uvicorn

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Vercel Webhook Handler",
    description="FastAPI application for handling Vercel webhooks",
    version="1.0.0"
)

# Get webhook secret from environment
WEBHOOK_SECRET = os.environ.get("VERCEL_WEBHOOK_SECRET", "")


def verify_signature(body: bytes, signature: str, secret: str) -> bool:
    """Verify Vercel webhook signature using HMAC-SHA1."""
    if not secret:
        logger.error("No webhook secret configured")
        return False

    # Compute expected signature
    expected_signature = hmac.new(
        secret.encode(),
        body,
        hashlib.sha1
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature, expected_signature)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "vercel-webhook-handler"}


@app.post("/webhooks/vercel")
async def handle_vercel_webhook(
    request: Request,
    x_vercel_signature: Optional[str] = Header(None)
):
    """Handle Vercel webhook events."""

    # Check signature header
    if not x_vercel_signature:
        logger.error("Missing x-vercel-signature header")
        raise HTTPException(status_code=400, detail="Missing x-vercel-signature header")

    # Get raw body
    body = await request.body()

    # Verify webhook secret is configured
    if not WEBHOOK_SECRET:
        logger.error("VERCEL_WEBHOOK_SECRET not configured")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Verify signature
    if not verify_signature(body, x_vercel_signature, WEBHOOK_SECRET):
        logger.error("Invalid webhook signature")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse JSON payload
    try:
        event = await request.json()
    except Exception as e:
        logger.error(f"Invalid JSON payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Log event details
    event_type = event.get("type", "unknown")
    event_id = event.get("id", "unknown")
    created_at = event.get("createdAt", 0)

    logger.info(f"Received Vercel webhook: {event_type}")
    logger.info(f"Event ID: {event_id}")
    logger.info(f"Created at: {datetime.fromtimestamp(created_at/1000).isoformat()}")

    # Extract payload
    payload = event.get("payload", {})

    # Handle different event types
    try:
        if event_type == "deployment.created":
            deployment = payload.get("deployment", {})
            project = payload.get("project", {})
            team = payload.get("team", {})

            logger.info(f"Deployment created: {deployment.get('id')}")
            logger.info(f"Project: {project.get('name')}")
            logger.info(f"URL: {deployment.get('url')}")
            logger.info(f"Team: {team.get('name')}")

            # Extract git metadata if available
            meta = deployment.get("meta", {})
            if meta:
                logger.info(f"Git ref: {meta.get('githubCommitRef')}")
                logger.info(f"Commit: {meta.get('githubCommitSha')}")
                logger.info(f"Message: {meta.get('githubCommitMessage')}")

        elif event_type == "deployment.succeeded":
            deployment = payload.get("deployment", {})
            logger.info(f"Deployment succeeded: {deployment.get('id')}")
            logger.info(f"URL: {deployment.get('url')}")
            logger.info(f"Duration: {deployment.get('duration')}ms")

            # Here you could trigger post-deployment tasks
            # like smoke tests, cache warming, notifications, etc.

        elif event_type == "deployment.ready":
            deployment = payload.get("deployment", {})
            logger.info(f"Deployment ready: {deployment.get('id')}")
            logger.info(f"URL: {deployment.get('url')}")
            # Deployment is now receiving traffic

        elif event_type == "deployment.error":
            deployment = payload.get("deployment", {})
            logger.error(f"Deployment failed: {deployment.get('id')}")
            logger.error(f"Error: {deployment.get('error')}")

            # Here you could send alerts to your team
            # or create an incident ticket

        elif event_type == "deployment.canceled":
            deployment = payload.get("deployment", {})
            logger.info(f"Deployment canceled: {deployment.get('id')}")

        elif event_type == "deployment.promoted":
            deployment = payload.get("deployment", {})
            logger.info(f"Deployment promoted: {deployment.get('id')}")
            logger.info(f"URL: {deployment.get('url')}")
            logger.info(f"Target: {deployment.get('target')}")
            # Could trigger cache clearing or feature flag updates

        elif event_type == "project.created":
            project = payload.get("project", {})
            logger.info(f"Project created: {project.get('name')}")
            logger.info(f"ID: {project.get('id')}")
            logger.info(f"Framework: {project.get('framework')}")

        elif event_type == "project.removed":
            project = payload.get("project", {})
            logger.info(f"Project removed: {project.get('name')}")
            logger.info(f"ID: {project.get('id')}")

            # Clean up any external resources associated with this project

        elif event_type == "project.renamed":
            project = payload.get("project", {})
            logger.info(f"Project renamed: {project.get('id')}")
            logger.info(f"Old name: {project.get('oldName')}")
            logger.info(f"New name: {project.get('name')}")
            # Update external references

        elif event_type == "domain.created":
            domain = payload.get("domain", {})
            project = payload.get("project", {})
            logger.info(f"Domain created: {domain.get('name')}")
            logger.info(f"Project: {project.get('name')}")

        elif event_type == "integration-configuration.removed":
            configuration = payload.get("configuration", {})
            integration = payload.get("integration", {})
            logger.info(f"Integration removed: {integration.get('name')}")
            logger.info(f"Configuration ID: {configuration.get('id')}")

        elif event_type == "attack.detected":
            attack = payload.get("attack", {})
            logger.warning(f"Attack detected: {attack.get('type')}")
            logger.warning(f"Action taken: {attack.get('action')}")
            logger.warning(f"Source IP: {attack.get('ip')}")

            # Here you could trigger security alerts
            # or update firewall rules

        else:
            logger.info(f"Unhandled event type: {event_type}")
            logger.debug(f"Payload: {payload}")

        # Return success response
        return JSONResponse(
            content={"received": True},
            status_code=200
        )

    except Exception as e:
        logger.error(f"Error processing webhook: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error processing webhook")


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "service": "Vercel Webhook Handler",
        "endpoints": {
            "health": "/health",
            "webhook": "/webhooks/vercel",
            "docs": "/docs",
            "redoc": "/redoc"
        }
    }


# Run the application
if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 8000))

    logger.info(f"Starting server on {host}:{port}")

    if not WEBHOOK_SECRET:
        logger.warning("WARNING: VERCEL_WEBHOOK_SECRET not set in environment")

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )