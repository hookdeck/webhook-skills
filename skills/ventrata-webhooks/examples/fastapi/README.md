# Ventrata Webhooks - FastAPI Example

Minimal example of receiving Ventrata OCTO webhooks and authenticating them with a secret header.

Ventrata webhooks are not signed, so there is no HMAC to verify. You add a secret header in the
webhook's `headers` map when you create it through the OCTO API. The handler compares that header
(name from `VENTRATA_WEBHOOK_HEADER`, value from `VENTRATA_WEBHOOK_SECRET`) with `hmac.compare_digest`
on bytes. This authenticates the sender, not the body, and gives no replay protection, so use HTTPS
and rotate the secret if it leaks. The route reads the body with `await request.body()`, so any
content type works.

## Prerequisites

- Python 3.9+
- A Ventrata OCTO API connection with the `octo/webhooks` capability (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `VENTRATA_WEBHOOK_HEADER` to the header name and `VENTRATA_WEBHOOK_SECRET` to the exact,
   whole header value you put in the webhook's `headers` map (including any `Bearer ` prefix).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/ventrata`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every event (in both `booking_update` and `booking.updated` forms) with correct,
wrong and missing secrets. No Ventrata account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/ventrata \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $VENTRATA_WEBHOOK_SECRET" \
  -d '{"event":"booking.updated","webhook":{"id":"webhook_booking_update"},"booking":{"uuid":"89fe0192-ddcd-430a-b285-e1396a4725d2","status":"ON_HOLD"}}'
```

## Receive Webhooks Locally

Ventrata can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 ventrata --path /webhooks/ventrata
```

Use the printed URL as the webhook `url` when you create the webhook.

## How It Works

- `main.py`: `verify_ventrata_request()` plus the `POST /webhooks/ventrata` route

1. The secret header is checked (as a FastAPI dependency) before the body is parsed. Failure
   returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `event`, accepting both forms: `order_update` / `order.updated`,
   `booking_update` / `booking.updated`, `availability_update` / `availability.updated`,
   `product_update` / `product.updated`.
4. It returns `200 {"received": true}`.
