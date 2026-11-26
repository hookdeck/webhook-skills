# Generated with: flexport-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

flexport_secret = os.environ.get("FLEXPORT_WEBHOOK_SECRET")


def verify_flexport_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify a Flexport webhook signature.

    Flexport signs the raw request body with HMAC-SHA256 keyed on your endpoint's
    secret token and sends the digest in `X-Hub-Signature-256` as `sha256=<hex>`.
    (A legacy `X-Hub-Signature` SHA-1 header is also sent for legacy integrations.)
    """
    algo, _, sig = (signature_header or "").partition("=")
    if algo != "sha256" or not sig:
        return False

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(sig, expected_signature)


@app.post("/webhooks/flexport")
async def flexport_webhook(request: Request):
    # Read the raw body for signature verification (do NOT parse first)
    raw_body = await request.body()
    signature_header = request.headers.get("x-hub-signature-256")

    # Verify webhook signature BEFORE parsing
    if not verify_flexport_webhook(raw_body, signature_header, flexport_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the Flexport Event object after verification
    event = json.loads(raw_body)
    event_type = event.get("type")   # milestone identifier, e.g. "/shipment#created"
    data = event.get("data") or {}
    resource = data.get("resource") or {}
    shipment = data.get("shipment") or {}
    location = data.get("location") or {}

    print(f"Received Flexport event {event_type} (id: {event.get('id')})")

    # Dispatch on the milestone identifier (/object#event format).
    # All of these are documented types on Flexport's Milestones page.
    if event_type == "/shipment#created":
        print(f"Shipment created: {resource.get('id')}")
        # Your code: create internal shipment/order record

    elif event_type == "/shipment#booking_confirmed":
        print(f"Booking confirmed for shipment: {shipment.get('id')}")
        # Your code: notify stakeholders, update ETAs

    elif event_type == "/shipment#delivered_in_full":
        print(f"Shipment delivered in full: {shipment.get('id')}")
        # Your code: close out order, trigger billing

    elif event_type == "/shipment_leg#departed":
        print(f"Shipment leg departed: {(location.get('place') or {}).get('name')}")
        # Your code: update in-transit status, notify customer

    elif event_type == "/shipment_leg#arrived":
        print(f"Shipment leg arrived: {(location.get('place') or {}).get('name')}")
        # Your code: trigger customs / last-mile workflow

    elif event_type == "/document#document_created":
        print(f"Document created: {resource.get('id')}")
        # Your code: sync commercial invoice / BOL / packing list

    elif event_type == "/invoice#invoice_payment_made":
        print(f"Invoice payment made: {resource.get('id')}")
        # Your code: reconcile accounts payable

    elif event_type == "/purchase_order#acknowledged":
        print(f"Purchase order acknowledged: {resource.get('id')}")
        # Your code: advance procurement workflow

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 200 promptly: Flexport retries a delivery a number of times
    # when it doesn't get one, so a slow response can bring the Event back.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
