from fastapi import FastAPI, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, Union, Literal
from datetime import datetime
import os
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Postmark Webhook Handler")

# Get webhook token from environment
POSTMARK_WEBHOOK_TOKEN = os.getenv("POSTMARK_WEBHOOK_TOKEN")
if not POSTMARK_WEBHOOK_TOKEN:
    raise ValueError("POSTMARK_WEBHOOK_TOKEN environment variable is required")


# Pydantic models for webhook events
class PostmarkEvent(BaseModel):
    RecordType: str
    MessageID: str
    ServerID: int
    MessageStream: Optional[str] = None
    Tag: Optional[str] = None
    Metadata: Optional[Dict[str, Any]] = None


class BounceEvent(PostmarkEvent):
    RecordType: Literal["Bounce"]
    Email: str
    Type: str
    TypeCode: int
    Description: str
    Details: str
    BouncedAt: str
    DumpAvailable: bool
    Inactive: bool
    CanActivate: bool
    Subject: Optional[str] = None


class SpamComplaintEvent(PostmarkEvent):
    RecordType: Literal["SpamComplaint"]
    Email: str
    BouncedAt: str


class OpenEvent(PostmarkEvent):
    RecordType: Literal["Open"]
    Email: str
    ReceivedAt: str
    Platform: Optional[str] = None
    UserAgent: Optional[str] = None


class ClickEvent(PostmarkEvent):
    RecordType: Literal["Click"]
    Email: str
    ClickedAt: str
    OriginalLink: str
    ClickLocation: Optional[str] = None
    Platform: Optional[str] = None
    UserAgent: Optional[str] = None


class DeliveryEvent(PostmarkEvent):
    RecordType: Literal["Delivery"]
    Email: str
    DeliveredAt: str
    Details: Optional[str] = None


class SubscriptionChangeEvent(PostmarkEvent):
    RecordType: Literal["SubscriptionChange"]
    Email: str
    ChangedAt: str
    SuppressionReason: Optional[str] = None


# Union type for all webhook events
WebhookEvent = Union[
    BounceEvent,
    SpamComplaintEvent,
    OpenEvent,
    ClickEvent,
    DeliveryEvent,
    SubscriptionChangeEvent,
    PostmarkEvent  # For unknown event types
]


@app.post("/webhooks/postmark", status_code=status.HTTP_200_OK)
async def handle_webhook(
    request: Request,
    token: Optional[str] = Query(None, description="Authentication token")
):
    """Handle Postmark webhook events."""

    # Verify authentication token
    if token != POSTMARK_WEBHOOK_TOKEN:
        logger.error("Invalid webhook token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized"
        )

    # Parse the raw body
    try:
        body = await request.json()
    except Exception as e:
        logger.error(f"Failed to parse request body: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload"
        )

    # Validate required fields
    if not body.get("RecordType") or not body.get("MessageID"):
        logger.error(f"Invalid payload structure: {body}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payload structure"
        )

    # Process the event
    record_type = body["RecordType"]
    message_id = body["MessageID"]

    logger.info(f"Received {record_type} event for message {message_id}")

    # Route to appropriate handler
    try:
        if record_type == "Bounce":
            event = BounceEvent(**body)
            await handle_bounce(event)
        elif record_type == "SpamComplaint":
            event = SpamComplaintEvent(**body)
            await handle_spam_complaint(event)
        elif record_type == "Open":
            event = OpenEvent(**body)
            await handle_open(event)
        elif record_type == "Click":
            event = ClickEvent(**body)
            await handle_click(event)
        elif record_type == "Delivery":
            event = DeliveryEvent(**body)
            await handle_delivery(event)
        elif record_type == "SubscriptionChange":
            event = SubscriptionChangeEvent(**body)
            await handle_subscription_change(event)
        else:
            logger.warning(f"Unknown event type: {record_type}")
            # Still return 200 for unknown events
    except Exception as e:
        logger.error(f"Error processing {record_type} event: {e}")
        # Still return 200 to prevent retries

    return {"received": True}


# Event handlers
async def handle_bounce(event: BounceEvent):
    """Process bounce events."""
    logger.info(f"Bounce: {event.Email}")
    logger.info(f"  Type: {event.Type}")
    logger.info(f"  Description: {event.Description}")
    logger.info(f"  Bounced at: {event.BouncedAt}")

    # In a real application:
    # - Mark email as undeliverable in your database
    # - Update contact status
    # - Trigger re-engagement workflow


async def handle_spam_complaint(event: SpamComplaintEvent):
    """Process spam complaint events."""
    logger.info(f"Spam complaint: {event.Email}")
    logger.info(f"  Complained at: {event.BouncedAt}")

    # In a real application:
    # - Remove from all mailing lists immediately
    # - Log for compliance tracking
    # - Update sender reputation metrics


async def handle_open(event: OpenEvent):
    """Process email open events."""
    logger.info(f"Email opened: {event.Email}")
    logger.info(f"  Opened at: {event.ReceivedAt}")
    if event.Platform:
        logger.info(f"  Platform: {event.Platform}")
    if event.UserAgent:
        logger.info(f"  User Agent: {event.UserAgent}")

    # In a real application:
    # - Track engagement metrics
    # - Update last activity timestamp
    # - Trigger engagement-based automation


async def handle_click(event: ClickEvent):
    """Process link click events."""
    logger.info(f"Link clicked: {event.Email}")
    logger.info(f"  Clicked at: {event.ClickedAt}")
    logger.info(f"  Link: {event.OriginalLink}")
    if event.ClickLocation:
        logger.info(f"  Click location: {event.ClickLocation}")

    # In a real application:
    # - Track click-through rates
    # - Log user behavior
    # - Trigger click-based automation


async def handle_delivery(event: DeliveryEvent):
    """Process delivery events."""
    logger.info(f"Email delivered: {event.Email}")
    logger.info(f"  Delivered at: {event.DeliveredAt}")
    logger.info(f"  Server: {event.ServerID}")

    # In a real application:
    # - Update delivery status
    # - Log successful delivery
    # - Clear any retry flags


async def handle_subscription_change(event: SubscriptionChangeEvent):
    """Process subscription change events."""
    logger.info(f"Subscription change: {event.Email}")
    logger.info(f"  Changed at: {event.ChangedAt}")
    if event.SuppressionReason:
        logger.info(f"  Suppression reason: {event.SuppressionReason}")

    # In a real application:
    # - Update subscription preferences
    # - Log for compliance
    # - Trigger preference center update


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "postmark-webhook-handler"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)