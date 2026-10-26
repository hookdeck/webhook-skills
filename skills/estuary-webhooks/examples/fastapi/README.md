# Estuary Webhooks - FastAPI Example

Minimal example of receiving Estuary materialization trigger and HTTP Webhook connector
requests and authenticating them with a secret header.

Estuary does not sign requests. You add a secret header to the materialization trigger (or the
HTTP Webhook connector's custom headers). The header name is yours, so the handler reads it from
`ESTUARY_WEBHOOK_HEADER` (default `Authorization`) and compares the **whole value** with
`ESTUARY_WEBHOOK_SECRET` in constant time. A static credential authenticates the sender, not the
body, and gives no replay protection: use HTTPS and rotate it if it leaks.

## Prerequisites

- Python 3.9+
- An Estuary materialization with a trigger or HTTP Webhook connector you can edit
  (see [../../references/setup.md](../../references/setup.md))

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

3. Set `ESTUARY_WEBHOOK_HEADER` and `ESTUARY_WEBHOOK_SECRET` (the exact, whole header value, e.g. `Bearer my-secret-token`).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts `GET`, `POST`, `PUT`, `PATCH` and `DELETE` at `/webhooks/estuary`.

## Test

```bash
pytest test_webhook.py
```

The tests use an illustrative payload (Estuary has no fixed event schema) with correct, wrong and
missing headers across all methods. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/estuary \
  -H "Content-Type: application/json" \
  -H "Authorization: $ESTUARY_WEBHOOK_SECRET" \
  -d '{"materialization_name":"acmeCo/orders/to-warehouse","run_id":"run-0001"}'
```

## Receive Estuary Webhooks Locally

```bash
npx hookdeck-cli listen 8000 estuary --path /webhooks/estuary
```

Use the printed URL as the trigger `url`. Hookdeck's Estuary source pre-selects `POST`; also allow
`PUT` or `PATCH` on it if your trigger uses them.

## How It Works

- `main.py`: `verify_estuary_request()`, the `require_estuary_auth` dependency and the `api_route` for `/webhooks/estuary`

1. The `require_estuary_auth` dependency compares the configured header with `ESTUARY_WEBHOOK_SECRET` for every method, before the body is read. Failure returns `401`.
2. The raw body is read, so any content type works and an empty body is fine.
3. JSON is parsed after the check; anything else is kept as text.
4. There is no vendor event field: the handler tells a trigger body (`materialization_name`) from any other document.
5. It returns `200 {"received": true}`.
