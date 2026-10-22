import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_firehydrant_webhook(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    """Verify a FireHydrant webhook signature.

    fh-signature is the bare hex HMAC-SHA256 of the raw request body, keyed with the webhook Secret.
    """
    if not signature or not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature, expected)


@app.post("/webhooks/firehydrant")
async def firehydrant_webhook(request: Request):
    # Raw body: read it before any JSON parsing
    raw_body = await request.body()
    signature = request.headers.get("fh-signature")

    if not verify_firehydrant_webhook(raw_body, signature, os.environ.get("FIREHYDRANT_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event") or {}
    data = payload.get("data") or {}
    resource_type = event.get("resource_type")
    # Operation casing varies (UPDATED vs updated), so normalise it
    operation = str(event.get("operation") or "").upper()

    if resource_type == "incident":
        incident = data.get("incident") or {}
        print(f"Incident #{incident.get('number')} {operation}: {incident.get('name')} ({incident.get('current_milestone')})")
        # TODO: Sync to ticketing, post status updates, etc.

    elif resource_type == "change_event":
        print(f"Change event {operation}: {data.get('summary')}")
        # TODO: Track deploys, correlate with incidents, etc.

    elif resource_type == "signals_alerts":
        alert = data.get("alert") or {}
        print(f"Signals alert {operation}: {alert.get('summary')} ({alert.get('status')}, decision: {alert.get('decision')})")
        # TODO: Forward alerts, track alert lifecycle, etc.

    else:
        print(f"Unhandled resource type: {resource_type}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
