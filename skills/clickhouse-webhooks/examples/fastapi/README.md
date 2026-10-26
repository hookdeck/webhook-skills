# ClickHouse (ClickStack) Webhooks - FastAPI Example

Minimal example of receiving ClickStack alert webhooks and authenticating them with the secret
header you configured. Covers ClickStack alert webhooks of type Generic only.

ClickStack does not sign payloads. A FastAPI dependency compares one header (name from
`CLICKHOUSE_WEBHOOK_HEADER`, default `Authorization`) with `CLICKHOUSE_WEBHOOK_SECRET`: the exact,
whole value, in constant time (`hmac.compare_digest` on bytes). A static credential authenticates
the sender, not the body, and gives no replay protection, so use HTTPS and rotate it if it leaks.

## Prerequisites

- Python 3.9+
- A ClickStack Generic webhook with a secret header (see [../../references/setup.md](../../references/setup.md))

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

3. Set `CLICKHOUSE_WEBHOOK_HEADER` and `CLICKHOUSE_WEBHOOK_SECRET` to match the header you added
   under **Webhook headers**.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/clickhouse`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send an illustrative payload with correct, wrong and missing headers.

## Receive Webhooks Locally

ClickStack can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 clickhouse --path /webhooks/clickhouse
```

Put the printed URL in the ClickStack webhook.

## How It Works

- `verify_clickhouse_request()` and the `require_clickhouse_secret` dependency in `main.py`

1. The secret header is checked before the body is read. Failure returns `401`.
2. The raw body is parsed as JSON if it is an object, otherwise treated as plain text.
3. The handler prints the `{{title}}`, `{{body}}` and `{{link}}` fields of the illustrative template.
   ClickHouse documents no event names.
4. It returns `200 {"received": true}`.
