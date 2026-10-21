import os
import hmac
import hashlib
import base64
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def active_secrets() -> list[str]:
    """Client secrets to try. Two are active during a Rutter secret rotation."""
    names = ("RUTTER_CLIENT_SECRET", "RUTTER_CLIENT_SECRET_PREVIOUS")
    return [os.environ[n] for n in names if os.environ.get(n)]


def verify_rutter_webhook(raw_body: bytes, signatures_header: str | None, secrets: list[str]) -> bool:
    """Verify a Rutter webhook signature.

    X-Rutter-Signature(s) = "sha256=" + base64(HMAC-SHA256(raw_body, client_secret)).
    X-Rutter-Signatures lists every active signature (two during secret rotation),
    so accept if any computed signature matches any received entry.
    """
    received = [s.strip() for s in (signatures_header or "").split(",") if s.strip()]
    if not received:
        return False

    for secret in secrets:
        if not secret:
            continue
        digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
        expected = "sha256=" + base64.b64encode(digest).decode("utf-8")
        if any(hmac.compare_digest(sig.encode("utf-8"), expected.encode("utf-8")) for sig in received):
            return True
    return False


@app.post("/webhooks/rutter")
async def rutter_webhook(request: Request):
    # Get the raw body for signature verification
    raw_body = await request.body()
    signatures = request.headers.get("x-rutter-signatures") or request.headers.get("x-rutter-signature")

    # Verify webhook signature
    if not signatures or not verify_rutter_webhook(raw_body, signatures, active_secrets()):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload after verification
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    code = event.get("code")
    print(f"Received {event.get('type')} {code} for connection {event.get('connection_id')}")

    # Handle the event based on code
    if code == "INITIAL_UPDATE":
        print(f"Initial data download complete: {event.get('connection_id')}")
        # TODO: Start fetching merchant data for this connection

    elif code == "CONNECTION_NEEDS_UPDATE":
        print(f"Connection needs re-authentication: {event.get('update_url')}")
        # TODO: Send update_url to the merchant

    elif code == "CONNECTION_DISABLED":
        print(f"Connection disabled: {event.get('disable_error')}")
        # TODO: Alert the merchant, check connection status

    elif code == "ORDER_CREATED":
        print(f"New order: {(event.get('order') or {}).get('id')}")
        # TODO: Sync new order, trigger fulfillment, etc.

    elif code == "ORDER_UPDATED":
        print(f"Order updated: {(event.get('order') or {}).get('id')}")
        # TODO: Update stored order

    elif code == "ORDER_DELETED":
        print(f"Order deleted: {(event.get('order') or {}).get('id')}")
        # TODO: Remove stored order

    elif code == "INVOICE_CREATED":
        print(f"New invoice: {(event.get('invoice') or {}).get('id')}")
        # TODO: Reconcile invoice

    elif code == "INVOICE_UPDATED":
        print(f"Invoice updated: {(event.get('invoice') or {}).get('id')}")
        # TODO: Update ledger sync

    else:
        print(f"Unhandled event: {event.get('type')} {code}")

    # Return 2xx within 5 seconds to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
