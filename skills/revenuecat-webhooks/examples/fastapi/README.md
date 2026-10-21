# RevenueCat Webhooks - FastAPI Example

Minimal example of receiving RevenueCat webhooks, verifying the optional `X-RevenueCat-Webhook-Signature` HMAC and/or the static `Authorization` header you configure on the integration.

## Prerequisites

- Python 3.10+
- A RevenueCat project on a plan with webhooks, and a webhook integration with an Authorization header value and/or HMAC signing enabled (see [setup](../../references/setup.md))

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

3. Set at least one of:
   - `REVENUECAT_WEBHOOK_SECRET` — the HMAC signing secret (shown once when you enable **HMAC webhook signing** or rotate it)
   - `REVENUECAT_WEBHOOK_AUTH` — the exact Authorization header value you entered on the integration (e.g. `Bearer <token>`)

   When both are set, both checks must pass.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000.

## Test

### Run unit tests

```bash
pytest test_webhook.py -v
```

The tests sign payloads with the real algorithm (HMAC-SHA256 hex over `<t>.<raw body>`) and cover Authorization-only, signature-only and combined modes, malformed headers, stale timestamps, tampered and re-serialised bodies, and every documented event type.

### Forward live events with the Hookdeck CLI

```bash
# No account required — first run prints a public URL
npx hookdeck-cli listen 8000 revenuecat --path /webhooks/revenuecat
```

Use the printed URL as the webhook URL on your RevenueCat integration, then click **Send test event**. You should see a `TEST` event logged and a `200` response.

## Endpoint

- `POST /webhooks/revenuecat` — checks `Authorization` and/or `X-RevenueCat-Webhook-Signature` (401 on failure), then routes on `event.type`. Always returns `200` on success: RevenueCat treats any other status as a failure.
- `GET /health` — liveness probe.
