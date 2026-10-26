# Firstbase Webhooks - FastAPI Example

Minimal example of receiving Firstbase webhooks and authenticating them with a custom header.

Firstbase does not sign payloads, so there is no HMAC to verify. With **Custom header
authentication**, Firstbase sends the header name and value you entered. The handler looks the
header up case-insensitively and compares the **whole** value with `FIRSTBASE_WEBHOOK_SECRET` in
constant time (no `Bearer` parsing). The route reads the raw body, so any content type works.

> Use Custom header authentication, not Auth token or OAuth.

## Prerequisites

- Python 3.9+
- A Firstbase account with webhooks enabled (see [../../references/setup.md](../../references/setup.md))

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

3. Set `FIRSTBASE_WEBHOOK_HEADER` (default `Authorization`) and `FIRSTBASE_WEBHOOK_SECRET` to the
   header name and the exact, whole header value you configured in Firstbase.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/firstbase`.

## Test

```bash
pytest test_webhook.py -v
```

The tests cover correct, wrong and missing header values and every `eventType`. No Firstbase
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/firstbase \
  -H "Content-Type: application/json" \
  -H "${FIRSTBASE_WEBHOOK_HEADER:-Authorization}: $FIRSTBASE_WEBHOOK_SECRET" \
  -d '{"eventType":"CREATED","id":"ord_12345"}'
```

## Receive Webhooks Locally

Firstbase can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 firstbase --path /webhooks/firstbase
```

Put the printed URL in the Firstbase webhook settings.

## How It Works

1. The custom header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `eventType`: `CREATED`, `UPDATED`, `DELETED`.
4. It returns `200 {"received": true}`.

A static shared header authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the value if it leaks.
