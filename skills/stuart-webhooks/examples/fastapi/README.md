# Stuart Webhooks - FastAPI Example

Minimal example of receiving Stuart webhooks and authenticating them with your webhook
authentication header.

Stuart does not sign payloads, so there is no HMAC to verify. A FastAPI dependency looks up the
header you configured (`STUART_WEBHOOK_HEADER`, default `X-Webhook-Secret`) case-insensitively and
compares its whole value with `STUART_WEBHOOK_SECRET` using `hmac.compare_digest` on bytes. The
route reads the body with `await request.body()`, so any content type works, and parses JSON only
after the check.

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp): use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A Stuart account with a webhook subscription (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `STUART_WEBHOOK_HEADER` and `STUART_WEBHOOK_SECRET` to the *Webhook authentication
   header* and *key* you entered in Stuart (the exact whole header value, including any `Bearer `
   prefix).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/stuart`.

## Test

```bash
pytest test_webhook.py
```

The tests send every v3 topic with correct, wrong and missing credentials. No Stuart account is
needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/stuart \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $STUART_WEBHOOK_SECRET" \
  -d '{"version":"v3","event_id":"1","webhook_id":1,"topic":"package_created","details":{"package":{"id":"1","reference":"r1"}}}'
```

## Receive Webhooks Locally

Stuart can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 stuart --path /webhooks/stuart
```

Put the printed URL in your Stuart webhook subscription.

## How It Works

- `main.py`: `verify_stuart_request()`, the `require_stuart_header` dependency and the
  `POST /webhooks/stuart` route

1. The authentication header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `topic`: `package_created`, `courier_assigned`, `courier_arriving`,
   `package_split`, `courier_waiting`, `package_delivering`, `package_delivered`,
   `package_canceled`, `package_returning`, `package_returned`, `courier_reassigning`,
   `courier_moving`.
4. It returns `200 {"received": true}`.
