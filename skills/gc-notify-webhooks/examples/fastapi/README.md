# GC Notify Webhooks - FastAPI Example

Minimal example of receiving GC Notify delivery receipt callbacks and authenticating them with the
`Authorization: Bearer` token.

GC Notify does not sign callbacks, so there is no HMAC to verify. The handler compares the bearer
token with your secret using a constant-time comparison. A static shared credential authenticates
the sender, not the body, and gives no replay protection: use HTTPS and rotate the token if it
leaks. The route reads the body with `await request.body()`, so any content type works.

## Prerequisites

- Python 3.9+
- A GC Notify service with callbacks configured (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `GC_NOTIFY_WEBHOOK_SECRET` to the bearer token you set for the callback in GC Notify
   (just the token, without `Bearer `).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/gc-notify`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every documented status, plus a health check body, with correct, wrong and missing
tokens. Payloads are built from the field table in the GC Notify docs. No GC Notify account is
needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/gc-notify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GC_NOTIFY_WEBHOOK_SECRET" \
  -d '{"id":"3b0f9c1e-6d6b-4a6c-9f1e-0a4d3d3f9e11","reference":"12345678","to":"hello@canada.ca","status":"delivered","status_description":"Delivered","notification_type":"email"}'
```

## Receive Webhooks Locally

GC Notify can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 8000 gc-notify --path /webhooks/gc-notify
```

Put the printed URL in GC Notify's callback settings.

## How It Works

- `main.py`: verification plus the `POST /webhooks/gc-notify` route

1. The `Authorization` header must start with `Bearer ` (any case) and the rest must equal the
   secret. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `status` field (callbacks have no `event` field): `created`,
   `sending`, `pending`, `sent`, `delivered`, `permanent-failure`, `temporary-failure`,
   `technical-failure`, `pending-virus-check`, `virus-scan-failed`. `{"health_check": "true"}` is
   acknowledged.
4. It returns `200 {"received": true}`. Keep it under 1 second.
