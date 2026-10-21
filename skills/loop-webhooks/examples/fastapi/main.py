# Generated with: loop-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Loop Webhook Handler")

# Loop delivers at least once and recommends deduplicating on the payload's
# eventId (stable across resends), NOT the svix-id header (per delivery
# message). In-memory for the example; use a database or Redis in production.
processed_event_ids: set[str] = set()


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/loop")
async def loop_webhook(
    request: Request,
    svix_id: str | None = Header(None),
    svix_timestamp: str | None = Header(None),
    svix_signature: str | None = Header(None),
):
    secret = os.environ.get("LOOP_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("LOOP_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not (svix_id and svix_timestamp and svix_signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify against the RAW body bytes Loop signed — never re-serialized JSON.
    body = await request.body()
    try:
        # HMAC-SHA256 over f"{svix-id}.{svix-timestamp}.{body}", base64,
        # compared in constant time against every `v1,` entry. Also rejects
        # timestamps more than 5 minutes from now.
        Webhook(secret).verify(
            body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError as err:
        print(f"Loop webhook verification failed: {err}")
        detail = (
            "Timestamp outside tolerance"
            if "timestamp" in str(err).lower()
            else "Invalid signature"
        )
        raise HTTPException(status_code=400, detail=detail)

    # Verified — only now parse the body.
    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # eventId is optional per Loop's docs ("may carry"); dedupe when present.
    event_id = event.get("eventId")
    if event_id:
        if event_id in processed_event_ids:
            print(f"Duplicate Loop event {event_id}, skipping")
            return {"received": True, "duplicate": True}
        processed_event_ids.add(event_id)

    # Loop payloads are flat: eventType, eventId, eventCreatedAt + QIDs.
    # Treat them as notifications and refetch current state from the Loop API.
    event_type = event.get("eventType")

    if event_type in ("payment.initiated", "payment.completed", "payment.failed"):
        print(f"Payment {event.get('paymentDisplayId')} ({event.get('paymentQid')}): {event_type}")
    elif event_type in (
        "receivable-invoice.created",
        "receivable-invoice.finalized",
        "receivable-invoice.voided",
    ):
        print(f"Receivable invoice {event.get('receivableInvoiceQid')}: {event_type}")
    elif event_type == "payable-invoice-review.completed":
        print(f"Payable invoice {event.get('payableInvoiceQid')} review: {event.get('outcome')}")
    elif event_type in (
        "payable-invoice.shipment-job-linked",
        "payable-invoice.shipment-job-unlinked",
    ):
        print(
            f"Payable invoice {event.get('payableInvoiceQid')} / "
            f"shipment job {event.get('shipmentJobQid')}: {event_type}"
        )
    elif event_type in ("shipment-job.normalized", "shipment-job.rerated"):
        print(f"Shipment job {event.get('shipmentJobQid')}: {event_type}")
    elif event_type in (
        "shipment-job-artifact.assigned",
        "shipment-job-artifact.unassigned",
        "shipment-job-artifact.assessed",
        "shipment-job-artifact.unassessed",
    ):
        print(
            f"Artifact {event.get('artifactQid')} on shipment job "
            f"{event.get('shipmentJobQid')}: {event_type}"
        )
    elif event_type == "artifact.root-ingestion-completed":
        print(f"Artifact ingestion completed: {event.get('artifactQid')}")
    elif event_type in (
        "business-exception.created",
        "business-exception.resolved",
        "business-exception.reopened",
        "business-exception.deleted",
    ):
        print(
            f"Exception \"{event.get('exceptionName')}\" on "
            f"{event.get('targetEntityQid')}: {event_type}"
        )
    elif event_type == "quick-pay-relationship.revised":
        print(
            f"QuickPay relationship revised: payee {event.get('payeeOrganizationQid')}, "
            f"payor {event.get('payorOrganizationQid')}"
        )
    elif event_type == "test-event.created":
        print("Loop test event received")
    else:
        print(f"Unhandled Loop event type: {event_type}")

    return {"received": True, "eventType": event_type}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
