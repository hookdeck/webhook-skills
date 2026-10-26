# Generated with: swan-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Swan delivers at least once, so the same eventId can arrive more than once.
# In production use a durable store (database, Redis) instead of process memory.
processed_event_ids: set = set()


def verify_swan_request(headers, secret=None) -> bool:
    """Swan does not sign payloads. When the subscription has a webhook secret, every
    request carries it as plain text in the x-swan-secret header. Compare the WHOLE
    header value with the secret (Starlette headers are case-insensitive).
    """
    secret = secret if secret is not None else os.environ.get("SWAN_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get("x-swan-secret")
    if not received:
        return False
    # compare_digest on bytes: str with non-ASCII characters would raise TypeError
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_swan_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_swan_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing x-swan-secret")


def handle_event(payload: dict) -> None:
    event_type = payload.get("eventType")
    resource_id = payload.get("resourceId")

    # Notifications are thin: query the Swan API with resourceId for the details.
    if event_type == "Transaction.Booked":
        print(f"Transaction booked: {resource_id}")
        # TODO: fetch the transaction and update your ledger

    elif event_type == "Transaction.Pending":
        print(f"Transaction pending: {resource_id}")
        # TODO: show the transaction as pending

    elif event_type == "Transaction.Rejected":
        print(f"Transaction rejected: {resource_id}")
        # TODO: notify the account holder

    elif event_type == "Account.Created":
        print(f"Account created: {resource_id}")
        # TODO: provision the account in your system

    elif event_type == "AccountHolder.Updated":
        print(f"Account holder updated: {resource_id}")
        # TODO: refresh the account holder's verification status

    elif event_type == "Card.Created":
        print(f"Card created: {resource_id}")
        # TODO: store the card reference

    elif event_type == "Onboarding.Updated":
        print(f"Onboarding updated: {resource_id}")
        # TODO: fetch the onboarding and advance your KYC flow

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/swan", dependencies=[Depends(require_swan_secret)])
async def swan_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    # Dedupe on eventId (at-least-once delivery); acknowledge duplicates.
    event_id = payload.get("eventId")
    if event_id and event_id in processed_event_ids:
        return {"received": True, "duplicate": True}

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Swan event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    if event_id:
        processed_event_ids.add(event_id)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
