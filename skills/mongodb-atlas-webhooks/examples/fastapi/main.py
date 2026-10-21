import base64
import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_atlas_signature(
    raw_body: bytes, signature: Optional[str], secret: Optional[str]
) -> bool:
    """Verify a MongoDB Atlas alert webhook signature.

    When a Webhook Secret is set, Atlas sends X-MMS-Signature =
    base64(HMAC-SHA1(secret, raw request body)). The secret is used as a raw
    string (not decoded). Without a secret the header is absent.
    """
    if not signature or not secret:
        return False

    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).digest()
    expected = base64.b64encode(digest).decode("ascii")
    return hmac.compare_digest(signature.encode("utf-8"), expected.encode("ascii"))


def handle_alert(alert: dict) -> None:
    """Handle an Atlas alert, dispatching on `eventTypeName`.

    `status` is OPEN while the alert condition holds and CLOSED when resolved.
    """
    event_type = alert.get("eventTypeName")
    alert_id = alert.get("id")
    status = alert.get("status")

    if event_type == "OUTSIDE_METRIC_THRESHOLD":
        current = alert.get("currentValue") or {}
        print(
            f"Metric alert {alert_id} ({status}): {alert.get('metricName')} = "
            f"{current.get('number')} {current.get('units', '')}"
        )
        # TODO: Page on-call, open an incident, or auto-scale on OPEN; resolve on CLOSED

    elif event_type == "HOST_DOWN":
        print(f"Host down alert {alert_id} ({status}): {alert.get('humanReadable')}")
        # TODO: Notify on-call / trigger failover checks

    else:
        print(f"Unhandled Atlas alert {alert_id}: {event_type} ({status})")


@app.post("/webhooks/mongodb-atlas")
async def mongodb_atlas_webhook(request: Request):
    secret = os.environ.get("MONGODB_ATLAS_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Header is only sent when a Webhook Secret is set in Atlas
    signature = request.headers.get("x-mms-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-MMS-Signature header")

    # Raw body for signature verification - don't parse JSON first
    raw_body = await request.body()
    if not verify_atlas_signature(raw_body, signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        alert = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(alert, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # X-MMS-Event carries the alert state (alert.open, alert.close, ...)
    print(f"X-MMS-Event: {request.headers.get('x-mms-event')}")
    # Use alert["id"] plus status/updated to de-duplicate retried deliveries
    handle_alert(alert)

    # Any 2xx tells Atlas the delivery succeeded
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
