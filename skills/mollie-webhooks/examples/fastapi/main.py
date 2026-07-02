# Generated with: mollie-webhooks skill
# https://github.com/hookdeck/webhook-skills

import os
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse

load_dotenv()

app = FastAPI()

# Mollie webhooks are NOT signed. Mollie POSTs an application/x-www-form-urlencoded
# body with a single `id` (e.g. tr_xxx) and NO status. We fetch the payment from the
# Mollie API to read its authoritative status — the "fetch-to-confirm" pattern.
#
# Mollie's official SDKs are Node and PHP, so for Python we call the REST API
# directly with httpx, authenticating with the API key as a Bearer token.

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


@app.post("/webhooks/mollie")
async def mollie_webhook(request: Request):
    # Mollie sends application/x-www-form-urlencoded, NOT JSON.
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
