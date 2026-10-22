# Rev AI Webhooks - FastAPI Example

Minimal example of receiving Rev AI (speech-to-text) job webhooks and authenticating them
with the `Authorization` header.

Rev AI does not sign payloads. The credential is the `Authorization` header you set per job
in `notification_config.auth_headers` (`<scheme> <token>`, e.g. `Bearer <token>`). A FastAPI
dependency compares the **whole header value**, scheme prefix included, with
`hmac.compare_digest` on bytes. A static credential authenticates the sender, not the body,
and gives no replay protection: use HTTPS and rotate it if it leaks.

## Prerequisites

- Python 3.9+
- A Rev AI account and access token

## Setup

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set `REV_AI_AUTHORIZATION` to the full header value, e.g. `Bearer <token>`.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/rev-ai`.

## Test

```bash
pytest test_webhook.py
```

## Receive Rev AI Webhooks Locally

```bash
npx hookdeck-cli listen 8000 rev-ai --path /webhooks/rev-ai
```

Use the printed URL as `notification_config.url` when submitting a job.

## How It Works

1. The `require_rev_ai_auth` dependency runs first and returns `401` on a missing or
   mismatched `Authorization` header.
2. The raw body is read with `request.body()` and parsed as JSON (`400` if invalid or not an object).
3. `job.status` is `transcribed` or `failed`; the route returns `200 {"received": true}`.
