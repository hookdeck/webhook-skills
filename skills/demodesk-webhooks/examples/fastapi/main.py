# Generated with: demodesk-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_demodesk_request(headers, header_name=None, secret=None) -> bool:
    """Demodesk does not sign payloads. You add a custom header to the webhook endpoint
    (the name is your choice) and compare its WHOLE value with the one you stored,
    including any "Bearer " prefix you typed. Starlette headers are case-insensitive.
    """
    header_name = header_name or os.environ.get("DEMODESK_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("DEMODESK_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)
    if not received:
        return False
    # compare_digest on bytes: str arguments raise TypeError on non-ASCII input.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_demodesk_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_demodesk_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def handle_event(payload: dict) -> None:
    meta = payload.get("meta")
    event = meta.get("event") if isinstance(meta, dict) else None
    action = event.get("action") if isinstance(event, dict) else None

    if action == "demo.scheduled":
        print("Demo scheduled")
        # TODO: create the meeting in your CRM

    elif action == "demo.rescheduled":
        print("Demo rescheduled")
        # TODO: update the meeting time

    elif action == "demo.event_response_updated":
        print("Demo invitation response updated")
        # TODO: record the attendee's response

    elif action == "demo.handovered":
        print("Demo handed over")
        # TODO: reassign the meeting owner

    elif action == "demo.canceled":
        print("Demo canceled")
        # TODO: cancel the meeting downstream

    elif action == "demo.started":
        print("Demo started")
        # TODO: mark the meeting as in progress

    elif action == "demo.call_note_updated":
        print("Demo call note updated")
        # TODO: sync the call note

    elif action == "demo.ended":
        print("Demo ended")
        # TODO: log the outcome (it can fire again if a meeting is restarted)

    elif action == "recording.uploaded":
        print("Recording uploaded")
        # TODO: fetch the recording through the Demodesk API

    elif action == "recording.transcription_postprocessed":
        print("Recording transcription post-processed")
        # TODO: fetch the transcript through the Demodesk API

    else:
        print(f"Unhandled event: {action}")


@app.post("/webhooks/demodesk", dependencies=[Depends(require_demodesk_credential)])
async def demodesk_webhook(request: Request):
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
        print(f"Error handling Demodesk event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
