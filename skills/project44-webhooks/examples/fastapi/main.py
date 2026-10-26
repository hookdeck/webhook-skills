# Generated with: project44-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_project44_request(headers, env=None) -> bool:
    """project44 does not sign payloads. With the API_KEY authentication method it adds a
    header you named (api_key_name) with the value you chose. The header name is user-chosen,
    so it comes from PROJECT44_WEBHOOK_HEADER; the expected value is the exact, whole header
    value from PROJECT44_WEBHOOK_SECRET (no "Bearer " parsing).
    """
    env = env if env is not None else os.environ
    secret = env.get("PROJECT44_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    name = env.get("PROJECT44_WEBHOOK_HEADER") or "X-Api-Key"
    received = headers.get(name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str, and bytes
    # of different lengths simply compare unequal.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_project44_key(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_project44_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing API key header")


def handle_event(payload: dict) -> None:
    event_type = payload.get("eventType")
    event_id = payload.get("eventId")
    context = payload.get("context")
    shipment = context.get("shipment") if isinstance(context, dict) else None
    shipment_id = shipment.get("shipmentId") if isinstance(shipment, dict) else None

    # project44 can redeliver after a lost response: dedupe on eventId in real code.
    if event_type == "shipments.v1.shipment.created":
        print(f"Shipment created: {shipment_id} ({event_id})")
        # TODO: register the shipment in your system

    elif event_type == "shipments.v1.shipment.deleted":
        print(f"Shipment deleted: {shipment_id} ({event_id})")
        # TODO: stop tracking the shipment

    elif event_type == "shipments.v1.event.added":
        print(f"Shipment event added: {shipment_id} ({event_id})")
        # TODO: record the new milestone from payload["data"]

    elif event_type == "shipments.v1.event.updated":
        print(f"Shipment event updated: {shipment_id} ({event_id})")
        # TODO: update the milestone from payload["data"]

    elif event_type == "shipments.v1.event.removed":
        print(f"Shipment event removed: {shipment_id} ({event_id})")
        # TODO: remove the milestone

    elif event_type == "shipments.v1.state.added":
        print(f"Shipment state added: {shipment_id} ({event_id})")
        # TODO: record the new state from payload["data"]

    elif event_type == "shipments.v1.state.updated":
        print(f"Shipment state updated: {shipment_id} ({event_id})")
        # TODO: update the state from payload["data"]

    elif event_type == "shipments.v1.state.removed":
        print(f"Shipment state removed: {shipment_id} ({event_id})")
        # TODO: remove the state

    elif event_type == "shipments.v1.exception.addedOrUpdated":
        print(f"Shipment exception added or updated: {shipment_id} ({event_id})")
        # TODO: alert on the exception in payload["data"]

    else:
        print(f"Unhandled event: {event_type}")


# The webhook method is configurable in project44 (POST by default), so accept all four.
@app.api_route(
    "/webhooks/project44",
    methods=["GET", "POST", "PUT", "PATCH"],
    dependencies=[Depends(require_project44_key)],
)
async def project44_webhook(request: Request):
    # Read the raw body so any content type is accepted. An empty body (e.g. GET) is fine.
    raw_body = await request.body()
    if not raw_body.strip():
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling project44 event: {err}")
        # project44 does not retry 500 but does retry 503, so signal a transient failure.
        raise HTTPException(status_code=503, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
