# Generated with: paxos-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

TRANSFER_RE = re.compile(r"^transfer\.[a-z_]+\.(pending|completed|failed)$")
ORCHESTRATION_RE = re.compile(r"^orchestration\.(processing|pending|rejected|completed|failed)$")


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides to bytes: compare_digest raises on non-ASCII str."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_paxos_request(headers, secret=None, header_name=None) -> bool:
    """Paxos does not sign webhook events. With Auth Type "API Key", Paxos sends the header
    name and value you configured on the webhook. The whole header value is compared
    as-is (no "Bearer " parsing). Starlette headers are case-insensitive.
    """
    secret = secret if secret is not None else os.environ.get("PAXOS_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("PAXOS_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)
    return bool(received) and safe_equal(received, secret)


async def require_paxos_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_paxos_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def handle_event(event: dict) -> None:
    event_id = event.get("id")
    event_type = event["type"]

    # At-least-once delivery: dedupe on event id before doing real work.
    # Events are thin: fetch the full object with the Get Event API using the event id.
    if event_type == "identity.approved":
        print(f"Identity approved (event {event_id})")
        # TODO: Get Event, then mark the identity as verified

    elif event_type == "identity.denied":
        print(f"Identity denied (event {event_id})")
        # TODO: Get Event, then notify the customer

    elif event_type == "identity.documents_required":
        print(f"Identity documents required (event {event_id})")
        # TODO: Get Event, then ask the customer for documents

    elif event_type in ("identity.documents_accepted", "identity.documents_denied"):
        print(f"Identity EDD review result: {event_type} (event {event_id})")
        # TODO: Get Event for the review outcome

    elif TRANSFER_RE.match(event_type):
        print(f"Transfer event {event_type} (event {event_id})")
        # TODO: Get Event, then update the deposit or withdrawal, e.g. transfer.crypto_deposit.completed

    elif ORCHESTRATION_RE.match(event_type):
        print(f"Orchestration event {event_type} (event {event_id})")
        # TODO: Get Event, then update the mint, convert or redeem

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/paxos", dependencies=[Depends(require_paxos_credential)])
async def paxos_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(event, dict) or not isinstance(event.get("type"), str):
        raise HTTPException(status_code=400, detail="Expected a JSON event object with a type")

    # Test events come from the Dashboard Test feature only.
    if event.get("is_test") is True:
        print("Received test event, ignoring...")
        return {"received": True, "test": True}

    try:
        handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Paxos event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
