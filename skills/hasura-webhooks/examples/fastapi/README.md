# Hasura Webhooks - FastAPI Example

Minimal example of receiving Hasura Event Trigger webhooks and authenticating them with a secret
header.

Hasura v2 Event Triggers are not signed, so there is no HMAC to verify. You add a secret header to
the trigger; a FastAPI dependency compares that header's whole value with `HASURA_WEBHOOK_SECRET`
using `hmac.compare_digest` on bytes. A static shared credential authenticates the sender, not the
body, and gives no replay protection, so use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A Hasura v2 Event Trigger with a secret header (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `HASURA_WEBHOOK_HEADER` to the header name you added to the trigger, and
   `HASURA_WEBHOOK_SECRET` to its exact whole value (including any `Bearer ` prefix).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/hasura`.

## Test

```bash
pytest test_webhook.py
```

The tests send every operation (`INSERT`, `UPDATE`, `DELETE`, `MANUAL`) with correct, wrong and
missing header values. No Hasura instance is needed.

## Receive Webhooks Locally

Hasura Cloud can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 hasura --path /webhooks/hasura
```

Put the printed URL in the Event Trigger's Webhook URL.

## How It Works

- `main.py`: `verify_hasura_request()`, the `require_hasura_header` dependency and the route

1. The dependency checks the configured header before the body is parsed. Failure returns `401`.
2. The raw body must be a JSON object with `event.op` (`400` otherwise).
3. The handler dispatches on `event.op`: `INSERT`, `UPDATE`, `DELETE`, `MANUAL`.
4. It returns `200 {"received": true}`; non-2xx responses make Hasura retry per `retry_conf`.
