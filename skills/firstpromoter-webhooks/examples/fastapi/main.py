# Generated with: firstpromoter-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# In-memory dedupe for the example; use a durable store (Redis, database) in production.
seen_events: set = set()


def verify_firstpromoter_request(headers, secret=None, name=None) -> bool:
    """FirstPromoter does not sign payloads. Webhooks v2 subscriptions can send custom
    headers; the header name is whatever you chose, and its value is compared whole
    (do not strip a "Bearer " prefix). A static credential authenticates the sender,
    not the body, and gives no replay protection: use HTTPS and dedupe on event_id.
    """
    secret = secret if secret is not None else os.environ.get("FIRSTPROMOTER_WEBHOOK_SECRET", "")
    name = name or os.environ.get("FIRSTPROMOTER_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # Bytes, not str: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_firstpromoter_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_firstpromoter_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_event(payload: dict) -> None:
    event_type = payload.get("event_type")
    entity_id = payload.get("entity_id")
    data = payload.get("data") or {}
    changes = payload.get("changes") or {}

    if event_type == "promoter.created":
        print(f"Promoter created: {data.get('email')} ({entity_id})")
        # TODO: create a CRM contact, send onboarding

    elif event_type == "promoter.updated":
        print(f"Promoter updated: {entity_id} {list(changes)}")
        # TODO: sync the profile

    elif event_type == "promoter.deleted":
        print(f"Promoter deleted: {entity_id}")
        # TODO: deprovision

    elif event_type == "promoter.balance.updated":
        print(f"Promoter balance updated: {entity_id}")
        # TODO: update the balance shown in your app

    elif event_type == "referral.created":
        print(f"Referral created: {data.get('email')} ({entity_id})")
        # TODO: attribute the signup

    elif event_type == "referral.updated":
        print(f"Referral updated: {entity_id} {list(changes)}")
        # TODO: sync state (changes["state"] = [old, new])

    elif event_type == "referral.converted":
        print(f"Referral converted: {data.get('email')} ({entity_id})")
        # TODO: credit the promoter, notify

    elif event_type == "referral.cancelled":
        print(f"Referral cancelled: {entity_id}")
        # TODO: reverse benefits

    elif event_type == "referral.deleted":
        print(f"Referral deleted: {entity_id}")
        # TODO: clean up

    elif event_type == "referral.moved":
        print(f"Referral moved campaign: {entity_id}")
        # TODO: re-tier

    elif event_type == "commission.created":
        print(f"Commission created: {entity_id} amount={data.get('amount')} {data.get('unit')}")
        # TODO: record the liability

    elif event_type == "commission.updated":
        print(f"Commission updated: {entity_id} {list(changes)}")
        # TODO: sync status

    elif event_type == "commission.approved":
        print(f"Commission approved: {entity_id}")
        # TODO: queue for payout

    elif event_type == "commission.pending":
        print(f"Commission pending: {entity_id}")
        # TODO: hold

    elif event_type == "commission.denied":
        print(f"Commission denied: {entity_id}")
        # TODO: notify the promoter

    elif event_type == "commission.deleted":
        print(f"Commission deleted: {entity_id}")
        # TODO: remove the liability

    elif event_type == "payout.created":
        print(f"Payout created: {entity_id}")
        # TODO: open a payout record

    elif event_type == "payout.completed":
        print(f"Payout completed: {entity_id}")
        # TODO: mark as paid

    elif event_type == "payout.failed":
        print(f"Payout failed: {entity_id}")
        # TODO: alert finance

    elif event_type == "contract_document.signed":
        print(f"Contract signed: {entity_id} by promoter {data.get('promoter_id')}")
        # TODO: unlock the program for the promoter

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/firstpromoter", dependencies=[Depends(require_firstpromoter_secret)])
async def firstpromoter_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    # Retries redeliver the same event_id; acknowledge repeats without reprocessing.
    event_id = payload.get("event_id") or request.headers.get("x-event-id")
    if event_id and event_id in seen_events:
        return {"received": True, "duplicate": True}

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling FirstPromoter event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    if event_id:
        seen_events.add(event_id)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
