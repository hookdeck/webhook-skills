# 100ms Webhooks - FastAPI Example

Minimal example of receiving 100ms webhooks and authenticating them with a secret header.

100ms webhooks are not signed, so there is no HMAC to verify. You add a secret header to the
webhook in the 100ms dashboard, and the handler compares that header's whole value with
`HUNDRED_MS_WEBHOOK_SECRET` in constant time (`hmac.compare_digest` on bytes). The route reads the
body with `await request.body()`, so any content type works.

## Prerequisites

- Python 3.9+
- A 100ms account with a webhook configured (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `HUNDRED_MS_WEBHOOK_HEADER` to the header name you chose in the 100ms dashboard (default
   `Authorization`) and `HUNDRED_MS_WEBHOOK_SECRET` to its exact, whole value (including any
   `Bearer ` prefix you typed).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/100ms`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every documented event with correct, wrong and missing header values. No 100ms
account is needed.

## Receive Webhooks Locally

100ms can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 100ms --path /webhooks/100ms
```

Put the printed URL in the 100ms dashboard webhook configuration.

## How It Works

- `main.py`: `verify_100ms_request()`, the `require_100ms_secret` dependency and the route

1. The secret header is checked by a dependency before the body is parsed. Failure returns `401`.
2. The body must be a JSON object with a `type` (`400` otherwise).
3. Repeated `id`s (100ms retries three times on any non-200) are acknowledged without reprocessing.
4. The handler dispatches on `type`, e.g. `peer.join.success`, `session.close.success`,
   `recording.success`, `hls.started.success`.
5. It returns `200 {"received": true}`.

A static shared header authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the secret if it leaks.
