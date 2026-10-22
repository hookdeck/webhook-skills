# Northflank Webhooks - FastAPI Example

Minimal example of receiving Northflank **webhook notification integration** requests,
authenticated with the integration's secret.

Northflank does not sign the payload. It sends the secret you set on the integration, unchanged,
in the `X-Northflank-Notification-Integration-Token` header. The handler compares it with your
`NORTHFLANK_WEBHOOK_SECRET` using `hmac.compare_digest` on equal-length digests.

## Prerequisites

- Python 3.9+
- A Northflank account with a webhook notification integration (see [../../references/setup.md](../../references/setup.md))

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

3. Set `NORTHFLANK_WEBHOOK_SECRET` to a long random value (`openssl rand -hex 32`) and enter
   the same value in the **Secret** field of the Northflank webhook integration. The secret is
   optional in Northflank, but set one: without it anyone can post to your endpoint.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/northflank`.

## Test

```bash
pytest test_webhook.py
```

The tests send requests with a correct, wrong and missing token and check the event dispatch.
No Northflank account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/northflank \
  -H "Content-Type: application/json" \
  -H "X-Northflank-Notification-Integration-Token: $NORTHFLANK_WEBHOOK_SECRET" \
  -d '{"event":"build:start","data":{"build":{"id":"social-hour-1312"},"service":{"id":"website"},"project":{"id":"personal-blog"}}}'
```

## Receive Webhooks Locally

Northflank can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 northflank --path /webhooks/northflank
```

Use the printed URL as the webhook URL of the Northflank notification integration.

## How It Works

- `main.py`: `verify_northflank_request()`, the `require_northflank_token` dependency and the
  `POST /webhooks/northflank` route

1. The dependency checks the token before the body is read. A missing or wrong
   `X-Northflank-Notification-Integration-Token` returns `401`.
2. The body is read as raw bytes (any content type) and must be a JSON object (`400` otherwise).
3. The handler dispatches on the `event` field (`build:start`, `build:success`, `build:failure`,
   `service:deployment:status-update`, `job-run:failure`, `addon-backup:success`,
   `addon-backup:failure`, `billing:invoice-payment-failed`).
4. It returns `200`. Northflank resends notifications that don't get a `2xx` and disables
   webhooks that keep failing.
