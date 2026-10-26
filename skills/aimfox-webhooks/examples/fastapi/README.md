# Aimfox Webhooks - FastAPI Example

Minimal example of receiving Aimfox webhooks and authenticating them with the webhook's
Authentication Header.

Aimfox does not sign payloads, so there is no HMAC to verify. A FastAPI dependency reads the header
named by `AIMFOX_WEBHOOK_HEADER` (default `Authorization`) and compares its whole value with
`AIMFOX_WEBHOOK_SECRET` in constant time (`hmac.compare_digest` on bytes). A static shared
credential authenticates the sender, not the body, and gives no replay protection, so use HTTPS and
rotate the credential if it leaks. The handler reads the raw body, so any content type works.

## Prerequisites

- Python 3.9+
- An Aimfox workspace with a webhook (see [../../references/setup.md](../../references/setup.md))

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

3. Set `AIMFOX_WEBHOOK_HEADER` to the header name and `AIMFOX_WEBHOOK_SECRET` to the exact whole
   value (including any `Bearer ` prefix) you entered in the webhook's **Authentication Header**.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/aimfox`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every documented event with correct, wrong and missing credentials. No Aimfox
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/aimfox \
  -H "Content-Type: application/json" \
  -H "Authorization: $AIMFOX_WEBHOOK_SECRET" \
  -d '{"id":"evt_1","event_type":"new_connection","event":{},"workspace":{"id":"w1"}}'
```

## Receive Webhooks Locally

Aimfox can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 8000 aimfox --path /webhooks/aimfox
```

Put the printed URL in the Aimfox webhook.

## How It Works

- `main.py`: `verify_aimfox_request()`, the `require_aimfox_header` dependency and the route

1. The dependency checks the configured header before the body is parsed. Missing or different
   returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `event_type`: `account_logged_in`, `account_logged_out`,
   `new_connection`, `view`, `connect`, `accepted`, `inmail`, `message`, `new_reply`, `reply`,
   `inmail_reply`, `lead_label_added`, `campaign_created`, `campaign_started`, `campaign_ended`,
   `inbox_event`, `campaign_reply`.
4. It returns `200 {"received": true}`.
