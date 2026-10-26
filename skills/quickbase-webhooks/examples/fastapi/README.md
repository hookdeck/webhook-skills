# Quickbase Webhooks - FastAPI Example

Minimal example of receiving Quickbase table webhooks with FastAPI and authenticating them with a
secret header.

Quickbase does not sign webhooks. You add a secret header in the webhook's **Message header** list,
and a dependency compares it with `QUICKBASE_WEBHOOK_SECRET`: the exact, whole header value (any
`Bearer ` prefix included, never stripped) with `hmac.compare_digest` on bytes. The header name
comes from `QUICKBASE_WEBHOOK_HEADER` (default `Authorization`). A static credential authenticates
the sender, not the body, and gives no replay protection, so use HTTPS and rotate it if it leaks.

The route accepts POST, PUT, PATCH, GET and DELETE, reads the raw body (XML, JSON, RAW or empty),
and parses it only after the check.

## Prerequisites

- Python 3.9+
- A Quickbase app where you can create table webhooks (see [../../references/setup.md](../../references/setup.md))

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

3. Set `QUICKBASE_WEBHOOK_SECRET` (and `QUICKBASE_WEBHOOK_HEADER` if not `Authorization`) to match
   the header you add in the Quickbase webhook.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `/webhooks/quickbase`.

## Test

```bash
pytest test_webhook.py -v
```

The tests cover correct, wrong, missing and prefix-stripped secrets, every method, and JSON, XML,
RAW and empty bodies. No Quickbase account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/quickbase \
  -H "Content-Type: application/json" \
  -H "Authorization: $QUICKBASE_WEBHOOK_SECRET" \
  -d '{"event":"record_added","record_id":42,"table":"Projects"}'
```

## Receive Webhooks Locally

Quickbase can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 quickbase --path /webhooks/quickbase
```

Put the printed URL in the webhook's **Endpoint URL**.

## How It Works

- `main.py`: `verify_quickbase_request()`, the `require_quickbase_secret` dependency and the route

1. The dependency checks the secret header before the body is read. Failure returns `401`.
2. The body (if any) is parsed as JSON when possible; XML, RAW text and empty bodies are accepted.
3. The `event` field is **illustrative**: Quickbase adds no event field, so it is a literal you put
   in your own message body template. The handler recognizes `record_added`, `record_modified` and
   `record_deleted` and acknowledges anything else.
4. It returns `200 {"received": true}`.
