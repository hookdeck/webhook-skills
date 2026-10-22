# Generated with: fourkites-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

BASIC_RE = re.compile(r"basic\s+([A-Za-z0-9+/]+={0,2})\s*", re.IGNORECASE)  # scheme is case-insensitive


def verify_fourkites_request(headers, user=None, password=None) -> bool:
    """FourKites does not sign callbacks. With Basic auth every request carries
    'Authorization: Basic base64(username:password)'. This authenticates the sender, not the
    body, and gives no replay protection: use HTTPS and rotate on leak. The credentials must
    arrive on the first request (no 401 + WWW-Authenticate challenge).
    """
    user = user if user is not None else os.environ.get("FOURKITES_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("FOURKITES_WEBHOOK_PASSWORD")
    if not user or not password:
        return False  # never accept when unconfigured
    m = BASIC_RE.fullmatch(headers.get("authorization", ""))
    if not m:
        return False
    try:
        decoded = base64.b64decode(m.group(1), validate=True)
    except ValueError:
        return False
    got_user, sep, got_pass = decoded.partition(b":")  # split on the first colon
    if not sep:
        return False
    # compare_digest on bytes (str raises on non-ASCII); evaluate both before deciding.
    user_ok = hmac.compare_digest(got_user, user.encode("utf-8"))
    pass_ok = hmac.compare_digest(got_pass, password.encode("utf-8"))
    return user_ok and pass_ok


async def require_fourkites_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_fourkites_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Basic credentials")


def handle_event(payload: dict) -> None:
    mtype = payload.get('MessageType')
    load = payload.get('LoadNumber')

    if mtype == "LOAD_CREATION":
        print(f"Load created: {load} (FourKitesLoadId {payload.get('FourKitesLoadId')})")
        # TODO: store FourKitesLoadId against your load

    elif mtype == "LOCATION_UPDATE":
        print(f"Location update: {load}")
        # TODO: update the live map

    elif mtype == "TRACKING_UPDATE":
        print(f"Tracking update: {load} {payload.get('Status', '')} {payload.get('Message', '')}")
        # TODO: raise delay or status alerts

    elif mtype == "STOP_ETA_UPDATED":
        print(f"Stop ETA updated: {load}")
        # TODO: re-plan dock appointments

    elif mtype == "STOP_ARRIVAL":
        print(f"Stop arrival: {load} at {payload.get('StopName')}")
        # TODO: start the detention clock

    elif mtype == "STOP_DEPARTURE":
        print(f"Stop departure: {load} from {payload.get('StopName')}")
        # TODO: advance pickup/delivery progress

    elif mtype == "STOP_AUTO_COMPLETED":
        print(f"Stop auto-completed: {load}")
        # TODO: close out the stop

    elif mtype == "MANUALLY_DELIVERED":
        print(f"Manually delivered: {load}")
        # TODO: close the shipment

    elif mtype == "MANUALLY_PICKED_UP":
        print(f"Manually picked up: {load}")
        # TODO: start in-transit tracking

    elif mtype == "STOP_APPOINTMENT_RESCHEDULED":
        print(f"Stop appointment rescheduled: {load}")
        # TODO: sync appointments

    elif mtype == "STOP_AMEND":
        print(f"Stop amended: {load}")
        # TODO: sync stop details

    elif mtype == "LOAD_DELETED":
        print(f"Load deleted: {load}")
        # TODO: remove it downstream

    else:
        print(f"Unhandled MessageType: {mtype}")


@app.post("/webhooks/fourkites", dependencies=[Depends(require_fourkites_auth)])
async def fourkites_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling FourKites callback: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
