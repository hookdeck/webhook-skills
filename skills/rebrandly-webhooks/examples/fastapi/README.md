# Rebrandly Webhooks - FastAPI Example

Minimal example of receiving Rebrandly webhooks (Clickstream click batches) and authenticating
them with a shared header.

Rebrandly webhooks are not signed. A FastAPI dependency reads the header named by
`REBRANDLY_WEBHOOK_HEADER` (default `Authorization`) and compares its whole value with
`REBRANDLY_WEBHOOK_SECRET` using `hmac.compare_digest` on bytes. The route uses `api_route` for
GET, POST, PUT, PATCH and DELETE, and handles an empty body.

## Prerequisites

- Python 3.9+
- A Rebrandly Clickstream webhook or account webhook with an authentication header

## Setup

1. Create a virtualenv and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `REBRANDLY_WEBHOOK_HEADER` to the header name you gave Rebrandly and
   `REBRANDLY_WEBHOOK_SECRET` to its exact value (including any `Bearer ` prefix).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts any method at `/webhooks/rebrandly`.

## Test

```bash
pytest test_webhook.py
```

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 rebrandly --path /webhooks/rebrandly
```

## How It Works

1. `require_rebrandly_credential` runs before the handler for every method; failure returns `401`.
2. An empty body returns `200`; invalid JSON returns `400`.
3. Each click in `data[]` is handled; returns `{"received": true, "clicks": n}`.
