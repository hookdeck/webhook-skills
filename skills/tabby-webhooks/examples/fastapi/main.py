# Generated with: tabby-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode to bytes first (compare_digest raises on non-ASCII
    str) and compare equal-length digests so the secret's length isn't leaked."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_tabby_request(headers, name=None, secret=None) -> bool:
    """Tabby does not sign payloads. If you set header.title / header.value when registering the
    webhook, Tabby adds that header to every notification. The name is yours (default
    X-Auth-Key); the whole value is compared, with no Bearer-prefix parsing. A static credential
    authenticates the sender, not the body, and gives no replay protection.
    """
    name = name or os.environ.get("TABBY_WEBHOOK_HEADER") or "X-Auth-Key"
    secret = secret if secret is not None else os.environ.get("TABBY_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(name)  # request.headers lookup is case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_tabby_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_tabby_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Tabby auth header")


def handle_payment(payment: dict) -> None:
    """Payment webhooks have no event field: the event is what changed."""
    payment_id = payment.get("id")
    status = payment.get("status")
    captures = payment.get("captures") or []
    refunds = payment.get("refunds") or []

    if status == "authorized":
        if not captures:
            print(f"Payment authorized: {payment_id}")
            # TODO: process the order, then send the Capture Request
        else:
            print(f"Payment captured: {payment_id}")
            # TODO: nothing to do, this confirms your own capture

    elif status == "closed":
        if refunds:
            print(f"Payment closed with refunds: {payment_id}")
            # TODO: record the latest entry in payment["refunds"]
        else:
            print(f"Payment closed: {payment_id}")
            # TODO: mark the order paid; never downgrade a closed payment to authorized

    elif status == "rejected":
        print(f"Payment rejected: {payment_id}")
        # TODO: cancel the order

    elif status == "expired":
        print(f"Payment expired: {payment_id}")
        # TODO: cancel the order

    else:
        print(f"Unhandled payment status: {status}")


def handle_dispute(dispute: dict) -> None:
    """Dispute webhooks carry dispute_id and a dispute status."""
    dispute_id = dispute.get("dispute_id")
    payment_id = dispute.get("payment_id")
    status = dispute.get("status")

    if status == "pending":
        print(f"Dispute opened: {dispute_id} on payment {payment_id}")
        # TODO: fetch the dispute and gather evidence

    elif status == "arbitration":
        print(f"Dispute in arbitration: {dispute_id}")

    elif status == "evidence_merchant":
        print(f"Dispute evidence requested: {dispute_id}")
        # TODO: provide supporting evidence

    elif status == "approved":
        print(f"Dispute approved: {dispute_id}")
        # TODO: record the refund to the customer

    elif status == "declined":
        print(f"Dispute declined: {dispute_id}")

    elif status == "cancelled":
        print(f"Dispute cancelled: {dispute_id}")

    else:
        print(f"Unhandled dispute status: {status}")


def handle_event(payload: dict) -> None:
    if payload.get("dispute_id"):
        handle_dispute(payload)
    else:
        handle_payment(payload)


@app.post("/webhooks/tabby", dependencies=[Depends(require_tabby_header)])
async def tabby_webhook(request: Request):
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
        print(f"Error handling Tabby event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    # Tabby treats anything other than 200 as a delivery error and retries.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
