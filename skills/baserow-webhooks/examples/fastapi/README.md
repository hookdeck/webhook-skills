# Baserow Webhooks - FastAPI Example

Minimal example of receiving Baserow webhooks and authenticating them with a secret custom header.

Baserow does not sign payloads, so there is no HMAC to verify. A dependency reads the header named
by `BASEROW_WEBHOOK_HEADER` (default `Authorization`) and compares its **whole value** with
`BASEROW_WEBHOOK_SECRET` using `hmac.compare_digest` on bytes. A static shared credential
authenticates the sender, not the body, and gives no replay protection, so use HTTPS and rotate the
secret if it leaks. The route accepts POST, PUT, PATCH, GET and DELETE and reads the raw body, so
any content type or an empty body works.

## Prerequisites

- Python 3.9+
- A Baserow table webhook with a secret custom header (see [../../references/setup.md](../../references/setup.md))

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

3. Set `BASEROW_WEBHOOK_HEADER` and `BASEROW_WEBHOOK_SECRET` to the header name and exact value you added to the webhook in Baserow.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `/webhooks/baserow`.

## Test

```bash
pytest test_webhook.py
```

The tests send events with correct, wrong and missing headers, every method, and empty bodies. No
Baserow account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/baserow \
  -H "Content-Type: application/json" \
  -H "Authorization: $BASEROW_WEBHOOK_SECRET" \
  -d '{"event_type":"rows.created","event_id":"00000000-0000-0000-0000-000000000000","table_id":1,"items":[{"id":1}]}'
```

## Receive Webhooks Locally

Baserow Cloud can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 baserow --path /webhooks/baserow
```

Put the printed URL in the Baserow webhook. If your webhook uses a method other than POST, also
allow it on the Hookdeck Baserow source (it pre-selects POST).

## How It Works

- `main.py`: `verify_baserow_request()`, the `require_baserow_secret` dependency and the `/webhooks/baserow` route

1. The secret header is checked by the dependency before the body is parsed. Failure returns `401`.
2. An empty body returns `200`; otherwise the body must be a JSON object (`400` otherwise).
3. The handler dispatches on `event_type`: `rows.created`, `rows.updated`, `rows.deleted`,
   `view.created`, `view.updated`, `view.deleted`, `field.created`, `field.updated`, `field.deleted`.
4. It returns `200 {"received": true}`.
