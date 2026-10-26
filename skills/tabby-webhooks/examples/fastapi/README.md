# Tabby Webhooks - FastAPI Example

Minimal example of receiving Tabby webhooks and authenticating them with the secret header you
set when you registered the webhook.

Tabby does not sign payloads, so there is no HMAC to verify. The handler looks up the header
named in `TABBY_WEBHOOK_HEADER` (default `X-Auth-Key`) case-insensitively and compares its whole
value with `TABBY_WEBHOOK_SECRET` in constant time. A static credential authenticates the sender,
not the body, and gives no replay protection, so use HTTPS. The route reads the raw body with
`await request.body()`, so any content type works.

## Prerequisites

- Python 3.9+
- A Tabby webhook registered with a `header` (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `TABBY_WEBHOOK_HEADER` to the `header.title` you registered and `TABBY_WEBHOOK_SECRET` to
   the exact `header.value`.

> Set the header when you register the webhook through the Tabby API (POST /api/v1/webhooks). Webhooks without one send nothing to verify.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/tabby`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send payment statuses and dispute statuses with correct, wrong and missing headers. No
Tabby account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/tabby \
  -H "Content-Type: application/json" \
  -H "X-Auth-Key: $TABBY_WEBHOOK_SECRET" \
  -d '{"id":"pay_123","status":"authorized","amount":"100","currency":"SAR","captures":[],"refunds":[]}'
```

## Receive Webhooks Locally

Tabby can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 8000 tabby --path /webhooks/tabby
```

Register the printed URL as the webhook `url`, with the same `header`.

## How It Works

- `main.py`: `verify_tabby_request()`, a `require_tabby_header` dependency and the `POST /webhooks/tabby` route

1. The secret header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. A body with `dispute_id` is a dispute webhook: dispatch on `status` (`pending`, `arbitration`,
   `evidence_merchant`, `approved`, `declined`, `cancelled`).
4. Otherwise it is a payment: there is no `event` field, so dispatch on `status` (`authorized`,
   `closed`, `rejected`, `expired`) plus `captures` and `refunds`.
5. It returns exactly `200 {"received": true}`; anything else makes Tabby retry.
