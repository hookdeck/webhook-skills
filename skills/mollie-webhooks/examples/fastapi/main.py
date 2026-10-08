# Generated with: mollie-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
from typing import Iterable, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse

load_dotenv()

app = FastAPI()

# Mollie has two webhook systems. Mollie recommends a separate URL for each:
#
# 1. Classic webhooks (POST /webhooks/mollie) — set per payment via `webhookUrl`.
#    NOT signed. Mollie POSTs an application/x-www-form-urlencoded body with a single
#    `id` (e.g. tr_xxx) and NO status. We fetch the payment from the Mollie API to
#    read its authoritative status — the "fetch-to-confirm" pattern. This example
#    calls the REST API directly with httpx (Mollie also publishes an official
#    Python library, mollie-api-py).
#
# 2. Next-gen webhooks (POST /webhooks/mollie/events) — subscriptions created in the
#    Dashboard or via POST /v2/webhooks. JSON event bodies, signed with
#    `X-Mollie-Signature: sha256=<hex HMAC-SHA256 of the raw body>`.

MOLLIE_API_BASE = "https://api.mollie.com/v2"


async def fetch_payment(
    payment_id: str, client: Optional[httpx.AsyncClient] = None
) -> Optional[dict]:
    """Fetch a payment from the Mollie API.

    Returns the payment dict, or None if the id is unknown/deleted (HTTP 404).
    Raises httpx.HTTPError for transient failures so the caller can return 500
    and let Mollie retry.

    The optional `client` makes this testable with httpx.MockTransport.
    """
    api_key = os.environ.get("MOLLIE_API_KEY")
    if not api_key:
        raise RuntimeError("MOLLIE_API_KEY is not set")

    owns_client = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=10)
    try:
        response = await client.get(
            f"{MOLLIE_API_BASE}/payments/{payment_id}",
            headers={"Authorization": f"Bearer {api_key}"},
        )
    finally:
        if owns_client:
            await client.aclose()

    if response.status_code == 404:
        return None  # unknown/deleted id
    response.raise_for_status()  # transient errors bubble up -> 500 -> Mollie retries
    return response.json()


def verify_mollie_signature(
    raw_body: bytes, signature_headers: Iterable[str], secret: Optional[str]
) -> bool:
    """Verify a next-gen X-Mollie-Signature against the raw body.

    During a secret rotation Mollie sends the header twice for 24 hours. Starlette
    exposes repeated headers via `headers.getlist()`; a proxy may also join them as
    "sha256=<a>, sha256=<b>". Accept if any value matches.
    """
    if not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    for header in signature_headers:
        for value in header.split(","):
            provided = value.strip()
            if provided.startswith("sha256="):
                provided = provided[len("sha256="):]
            if hmac.compare_digest(provided.encode(), expected.encode()):
                return True
    return False


def handle_event(event: dict) -> None:
    """Act on a verified next-gen event. `entityId` identifies the object; with the
    full payload a snapshot of it is in `_embedded.entity`. Keep this idempotent."""
    event_type = event.get("type")
    entity_id = event.get("entityId")

    if event_type == "payment.paid":
        print(f"Payment {entity_id} paid")
        # TODO: fulfill the order
    elif event_type == "payment.authorized":
        print(f"Payment {entity_id} authorized (capture to collect)")
    elif event_type in ("payment.canceled", "payment.expired", "payment.failed"):
        print(f"Payment {entity_id} did not complete: {event_type}")
    elif event_type == "payment-link.paid":
        print(f"Payment link {entity_id} paid")
    elif event_type == "sales-invoice.paid":
        print(f"Sales invoice {entity_id} paid")
    elif event_type in ("payout.completed", "payout.failed"):
        print(f"Payout {entity_id}: {event_type}")
    else:
        print(f"Unhandled Mollie event type: {event_type}")


def handle_payment(payment: dict) -> None:
    """Act on the authoritative status. Keep this idempotent — Mollie may call the
    webhook more than once for the same status."""
    payment_id = payment.get("id")
    status = payment.get("status")

    if status == "paid":
        print(f"Payment {payment_id} paid: {payment.get('amount')}")
        # TODO: fulfill the order, send a receipt
    elif status == "authorized":
        print(f"Payment {payment_id} authorized (capture to collect)")
    elif status == "canceled":
        print(f"Payment {payment_id} canceled")
    elif status == "expired":
        print(f"Payment {payment_id} expired")
    elif status == "failed":
        print(f"Payment {payment_id} failed")
    elif status == "pending":
        print(f"Payment {payment_id} pending")
    elif status == "open":
        print(f"Payment {payment_id} still open")
    else:
        print(f"Payment {payment_id} has unhandled status: {status}")


@app.post("/webhooks/mollie/events")
async def mollie_events_webhook(request: Request):
    """Next-gen webhooks: verify X-Mollie-Signature over the RAW body, then parse."""
    secret = os.environ.get("MOLLIE_WEBHOOK_SECRET")
    if not secret:
        # Never fail open: without a secret we cannot verify anything.
        print("MOLLIE_WEBHOOK_SECRET is not set")
        return PlainTextResponse("Webhook secret not configured", status_code=500)

    raw_body = await request.body()
    signatures = request.headers.getlist("x-mollie-signature")
    if not verify_mollie_signature(raw_body, signatures, secret):
        return PlainTextResponse("Invalid signature", status_code=400)

    try:
        event = json.loads(raw_body)
    except ValueError:
        return PlainTextResponse("Invalid JSON", status_code=400)

    handle_event(event)
    return PlainTextResponse("OK", status_code=200)


@app.post("/webhooks/mollie")
async def mollie_webhook(request: Request):
    # Classic webhooks: Mollie sends application/x-www-form-urlencoded, NOT JSON.
    form = await request.form()
    payment_id = form.get("id")

    if not payment_id or not isinstance(payment_id, str):
        # Not a valid Mollie webhook.
        return PlainTextResponse("Missing id", status_code=400)

    try:
        payment = await fetch_payment(payment_id)
    except (httpx.HTTPError, RuntimeError) as err:
        # Mollie API unreachable / errored — return 500 so Mollie retries later.
        print(f"Failed to fetch payment {payment_id}: {err}")
        return PlainTextResponse("Could not fetch payment", status_code=500)

    if payment is None:
        # Unknown/deleted id — acknowledge so Mollie stops retrying.
        return PlainTextResponse("OK", status_code=200)

    handle_payment(payment)
    return PlainTextResponse("OK", status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}
