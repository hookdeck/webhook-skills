# Generated with: sovos-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Sovos Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/sovos")
async def sovos_webhook(
    request: Request,
    svix_id: str | None = Header(None),
    svix_timestamp: str | None = Header(None),
    svix_signature: str | None = Header(None),
):
    """Receive a Sovos Indirect Tax API notification delivered through Svix."""
    secret = os.environ.get("SOVOS_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("Invalid webhook secret configuration")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not all([svix_id, svix_timestamp, svix_signature]):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify against the RAW body: Svix signs the exact bytes it sends.
    body = await request.body()
    try:
        # Checks the whsec_ secret, the 5-minute timestamp window, and every v1
        # signature. In svix 2.x verify() returns None; parse after it passes.
        Webhook(secret).verify(
            body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError as err:
        print(f"Webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        notification = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(notification, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Sovos puts the event name in the top-level eventType field.
    # notificationId (or svix-id) is a good idempotency key: Svix retries deliveries.
    event_type = notification.get("eventType")
    metadata = notification.get("metadata") or {}
    print(f"Received Sovos webhook: {event_type} ({notification.get('notificationId')})")

    if event_type == "document.received":
        print(
            f"Document received: {metadata.get('documentId')} "
            f"(ERP {metadata.get('erpDocumentId')}, status {metadata.get('sciResponseCode')})"
        )
        # TODO: update the ERP document status; fetch notification["contentUrl"] if needed
    elif event_type in ("document.completed", "workflow.completed"):
        print(f"Document processing completed: {metadata.get('documentId')}")
        # TODO: mark the invoice final and store legal attachments
    elif event_type == "system.error":
        print(f"Sovos system error: {metadata.get('documentId')}")
        # TODO: alert and flag the document for review
    else:
        print(f"Unhandled event type: {event_type}")

    return {"received": True, "eventType": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
