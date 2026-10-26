# Generated with: payroc-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Processed event ids. Use a shared store (Redis, database) in production.
seen_ids: set = set()


def verify_payroc_request(headers, secret=None) -> bool:
    """Payroc does not sign payloads. Every request carries the subscription's secret as
    plain text in the Payroc-Secret header. This authenticates the sender, not the body,
    and gives no replay protection: use HTTPS, dedupe on the event id, rotate on leak.
    Header lookup is case-insensitive.
    """
    secret = secret if secret is not None else os.environ.get("PAYROC_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get("payroc-secret")
    if not received:
        return False
    # Compare bytes: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_payroc_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_payroc_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Payroc-Secret")


def handle_event(event: dict) -> None:
    event_type = event.get("type")
    data = event.get("data") or {}

    if event_type == "processingAccount.status.changed":
        print(f"Processing account {data.get('processingAccountId')} status: {data.get('status')}")
        # TODO: update onboarding state

    elif event_type == "processingAccount.riskStatus.changed":
        print(f"Processing account {data.get('processingAccountId')} risk status: {data.get('riskStatus')}")
        # TODO: alert risk and support teams

    elif event_type == "processingAccount.signature.signed":
        print(f"Processing account {data.get('processingAccountId')} signed: {data.get('signed')}")
        # TODO: continue onboarding

    elif event_type == "terminalOrder.status.changed":
        print(f"Terminal order status changed: {json.dumps(data)}")
        # TODO: update fulfilment status

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/payroc", dependencies=[Depends(require_payroc_secret)])
async def payroc_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    # Retries re-send the same CloudEvent id: acknowledge without reprocessing.
    event_id = event.get("id")
    if event_id and event_id in seen_ids:
        return {"received": True, "duplicate": True}

    try:
        handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Payroc event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    if event_id:
        seen_ids.add(event_id)
    # Payroc expects exactly 200; anything else is retried five times.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
