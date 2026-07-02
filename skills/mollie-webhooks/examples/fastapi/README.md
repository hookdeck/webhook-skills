# Mollie Webhooks - FastAPI Example

Minimal example of receiving Mollie webhooks with FastAPI using the
**fetch-to-confirm** pattern.

Mollie webhooks are **not signed**. Mollie POSTs an
`application/x-www-form-urlencoded` body with a single `id` (e.g. `tr_xxx`) and no
status. This handler fetches the payment from the Mollie API with your API key and
acts on the authoritative status it returns.

Mollie's official SDKs are Node and PHP, so this example calls the REST API
directly with `httpx`, authenticating with the API key as a Bearer token.

## Prerequisites

- Python 3.9+
- A Mollie account and API key (`test_…` or `live_…`)

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Mollie API key to `.env`:
   ```bash
   MOLLIE_API_KEY=test_xxxxx
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST http://localhost:8000/webhooks/mollie`.

## Receive Webhooks Locally

Mollie must reach your handler over the public internet. Tunnel with the Hookdeck
CLI (no install, no account):

```bash
npx hookdeck-cli listen 8000 mollie --path /webhooks/mollie
```

Use the public URL it prints as the `webhookUrl` when you create a payment, then
complete the test checkout to trigger the webhook.

## Test

```bash
pytest test_webhook.py
```

The tests never hit the real Mollie API: handler tests monkeypatch the fetcher,
and `fetch_payment` itself is exercised with `httpx.MockTransport` (200 → dict,
404 → None, 5xx → raises). They cover missing id (400), unknown id (200), a failed
fetch (500 so Mollie retries), and dispatch for every payment status.

## How It Works

1. Mollie POSTs `id=tr_xxx` (form-urlencoded, unsigned).
2. The handler reads `id` from the form and calls `GET /v2/payments/{id}` with
   your API key as a Bearer token.
3. It dispatches on the fetched `payment["status"]` and returns `200`.
4. Unknown ids return `200`; a transient fetch failure returns `500` so Mollie
   retries.
