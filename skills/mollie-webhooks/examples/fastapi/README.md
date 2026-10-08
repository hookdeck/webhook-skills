# Mollie Webhooks - FastAPI Example

Minimal example of receiving both kinds of Mollie webhooks with FastAPI:

- **Classic webhooks** (`POST /webhooks/mollie`): unsigned, confirmed with the
  **fetch-to-confirm** pattern.
- **Next-gen webhooks** (`POST /webhooks/mollie/events`): signed JSON events,
  verified with the `X-Mollie-Signature` header.

Classic Mollie webhooks are **not signed**. Mollie POSTs an
`application/x-www-form-urlencoded` body with a single `id` (e.g. `tr_xxx`) and no
status. This handler fetches the payment from the Mollie API with your API key and
acts on the authoritative status it returns.

Next-gen webhooks carry `X-Mollie-Signature: sha256=<hex>`, an HMAC-SHA256 of the
raw request body keyed with the webhook's signing secret. The handler verifies it
before parsing the JSON, and accepts either of the two signatures Mollie sends
for 24 hours after a secret rotation.

The classic handler calls the REST API directly with `httpx`, authenticating with
the API key as a Bearer token (Mollie also publishes an official Python library,
`mollie-api-py`).

## Prerequisites

- Python 3.9+
- A Mollie account and API key (`test_…` or `live_…`)
- For next-gen webhooks: a webhook subscription and its signing secret

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

3. Add your Mollie API key (classic) and webhook signing secret (next-gen) to `.env`:
   ```bash
   MOLLIE_API_KEY=test_xxxxx
   MOLLIE_WEBHOOK_SECRET=your_webhook_signing_secret
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

Two webhook endpoints:

- `POST http://localhost:8000/webhooks/mollie`: classic webhooks
- `POST http://localhost:8000/webhooks/mollie/events`: next-gen webhooks

## Receive Webhooks Locally

Mollie must reach your handler over the public internet. Tunnel with the Hookdeck
CLI (no install, no account):

```bash
npx hookdeck-cli listen 8000 mollie --path /webhooks/mollie
```

Use the public URL it prints as the `webhookUrl` when you create a payment, then
complete the test checkout to trigger the webhook.

For next-gen webhooks, tunnel to the events route and use the printed URL as the
URL of a test-mode webhook subscription (Dashboard **Developers → Webhooks**, or
`POST /v2/webhooks` with `testmode: true`):

```bash
npx hookdeck-cli listen 8000 mollie-events --path /webhooks/mollie/events
```

## Test

```bash
pytest test_webhook.py
```

The tests never hit the real Mollie API: handler tests monkeypatch the fetcher,
and `fetch_payment` itself is exercised with `httpx.MockTransport` (200 → dict,
404 → None, 5xx → raises). They cover missing id (400), unknown id (200), a failed
fetch (500 so Mollie retries), and dispatch for every payment status. Next-gen
tests sign events with a test secret and cover a valid signature (200), missing
or wrong signature and tampered body (400), two signatures during a secret
rotation (200), and an unset secret (500).

## How It Works

**Classic** (`/webhooks/mollie`):

1. Mollie POSTs `id=tr_xxx` (form-urlencoded, unsigned).
2. The handler reads `id` from the form and calls `GET /v2/payments/{id}` with
   your API key as a Bearer token.
3. It dispatches on the fetched `payment["status"]` and returns `200`.
4. Unknown ids return `200`; a transient fetch failure returns `500` so Mollie
   retries.

**Next-gen** (`/webhooks/mollie/events`):

1. Mollie POSTs a JSON event with `X-Mollie-Signature: sha256=<hex>`.
2. The handler computes HMAC-SHA256 of the raw body with `MOLLIE_WEBHOOK_SECRET`
   and compares it (timing-safe) with each signature in the header.
3. On a match it parses the event, dispatches on `type` (using `entityId` to find
   the object), and returns `200`. Otherwise it returns `400`.
