# Generated with: foursquare-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI(title="Foursquare Webhook Handler")


def verify_pilgrim_secret(header_value: Optional[str], expected_secret: Optional[str]) -> bool:
    """
    Verify the Pilgrim-Secret header on a Foursquare Movement SDK webhook.

    Foursquare does NOT sign payloads. Every request carries the secret from the
    Developer Console's Pilgrim page, raw with no prefix, in `Pilgrim-Secret`.
    Both sides are hashed so the compared values always have the same length.
    """
    if not header_value or not expected_secret:
        return False
    return hmac.compare_digest(
        hashlib.sha256(header_value.encode()).digest(),
        hashlib.sha256(expected_secret.encode()).digest(),
    )


def require_pilgrim_secret(pilgrim_secret: Optional[str] = Header(None)) -> None:
    """FastAPI dependency that authenticates the Foursquare webhook request."""
    secret = os.getenv("FOURSQUARE_PILGRIM_SECRET")

    # Fail closed: without a configured secret there is nothing to check.
    if not secret:
        print("FOURSQUARE_PILGRIM_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook authentication not configured")

    if not verify_pilgrim_secret(pilgrim_secret, secret):
        print("Foursquare Pilgrim-Secret verification failed")
        raise HTTPException(status_code=401, detail="Unauthorized")


def handle_foursquare_event(event: Dict[str, Any]) -> None:
    event_type = event.get("eventType")

    if event_type in ("placeArrival", "placeDeparture"):
        venues = (event.get("placeEvent") or {}).get("venues") or [{}]
        name = venues[0].get("name") or "unknown place"
        verb = "Arrival at" if event_type == "placeArrival" else "Departure from"
        print(f"{verb} {name} (visit {event.get('pilgrimVisitId')})")
        # TODO: Log the visit, send a notification, or close out the visit
    elif event_type == "placeHistorical":
        print(f"Historical visit {event.get('pilgrimVisitId')}")
        # TODO: Backfill visit history
    elif event_type in ("geofenceEnter", "geofenceDwell", "geofencePresence", "geofenceExit"):
        geofence_id = (event.get("geofenceEvent") or {}).get("geofenceId")
        print(f"{event_type} for geofence {geofence_id}")
        # TODO: Trigger location-based logic
    elif event_type in (
        "journeysInProgress",
        "journeysApproaching",
        "journeysArrived",
        "journeysCompleted",
        "journeysCanceled",
    ):
        print(f"{event_type} for journey {event.get('journeyId')}")
        # TODO: Update trip state
    else:
        print(f"Unhandled Foursquare event: {event_type or 'unknown'}")


@app.post("/webhooks/foursquare", dependencies=[Depends(require_pilgrim_secret)])
async def handle_foursquare_webhook(request: Request):
    """Receive Foursquare Movement SDK events (secret is checked before the body is parsed)."""
    raw_body = await request.body()
    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    handle_foursquare_event(event)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
