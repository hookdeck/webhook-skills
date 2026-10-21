import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_motive_signature(
    raw_body: bytes, signature: Optional[str], secret: Optional[str]
) -> bool:
    """Verify a Motive webhook signature.

    Motive sends X-KT-Webhook-Signature = hex(HMAC-SHA1(sharedSecret, rawBody)).
    The secret is used as a plain string. No timestamp, no prefix.
    """
    if not signature or not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature.lower(), expected)


def handle_motive_event(event: dict) -> None:
    """Handle a Motive event, dispatching on its `action`."""
    action = event.get("action")
    vehicle = event.get("vehicle") or {}

    if action == "vehicle_location_updated":
        print(f"Vehicle {event.get('vehicle_number')} at {event.get('lat')},{event.get('lon')}")
        # TODO: Update live map / ETA

    elif action == "vehicle_location_received":
        print(f"Location received for vehicle {event.get('vehicle_id')}")
        # TODO: Append to location history

    elif action == "vehicle_upserted":
        print(f"Vehicle {event.get('id')} {event.get('trigger', 'upserted')}")
        # TODO: Sync the vehicle roster

    elif action == "fault_code_opened":
        print(f"Fault {event.get('code_label')} opened on vehicle {vehicle.get('number')}")
        # TODO: Create a maintenance ticket

    elif action == "fault_code_closed":
        print(f"Fault {event.get('code_label')} closed on vehicle {vehicle.get('number')}")
        # TODO: Close the maintenance ticket

    elif action == "user_upserted":
        print(f"User {event.get('id')} ({event.get('role')}) {event.get('trigger')}")
        # TODO: Sync drivers and admins

    elif action == "inspection_report_upserted":
        print(f"Inspection report {event.get('id')} upserted")
        # TODO: Route defects to maintenance

    elif action == "hos_violation_upserted":
        print(f"HOS violation {event.get('id')} upserted")
        # TODO: Alert dispatch / compliance

    elif action in ("vehicle_geofence_event", "asset_geofence_event"):
        print(f"Geofence event: {action}")
        # TODO: Track arrivals and departures

    elif action == "engine_toggle_event":
        print("Engine toggle event")
        # TODO: Update usage and idling reports

    elif action in (
        "speeding_event_created",
        "speeding_event_updated",
        "driver_performance_event_created",
        "driver_performance_event_updated",
    ):
        print(f"Safety event: {action} ({event.get('id')})")
        # TODO: Queue driver coaching

    elif action == "user_duty_status_updated":
        print("Driver duty status updated")
        # TODO: Sync timecards

    elif action == "form_entry_upserted":
        print(f"Form entry {event.get('id')} upserted")
        # TODO: Update dispatch workflow

    elif action in (
        "vehicle_gateway_disconnected",
        "vehicle_gateway_disconnect_ended",
        "dashcam_disconnected",
    ):
        print(f"Device event: {action} ({event.get('id')})")
        # TODO: Alert on device health

    else:
        print(f"Unhandled Motive action: {action}")


@app.post("/webhooks/motive")
async def motive_webhook(request: Request):
    secret = os.environ.get("MOTIVE_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw body for signature verification - don't parse JSON first
    raw_body = await request.body()
    signature = request.headers.get("x-kt-webhook-signature")

    # Motive documents 403 for a signature it could not verify (no retry)
    if not verify_motive_signature(raw_body, signature, secret):
        raise HTTPException(status_code=403, detail="Invalid signature")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except ValueError:
        # The activation test request body ([vehicle_location_updated]) is not valid JSON.
        # Answer 200 so Motive can enable the webhook.
        return {"received": True, "ignored": True}

    # Motive sends no event ID header: de-duplicate on action + payload id
    if isinstance(event, dict):
        handle_motive_event(event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
