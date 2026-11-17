# Honeycomb Webhooks - FastAPI Example

Minimal example of receiving Honeycomb webhooks (Triggers, SLO burn alerts, Anomaly Detection) and
authenticating them with the `X-Honeycomb-Webhook-Token` header.

Honeycomb does not sign payloads, so there is no HMAC to verify. It sends the webhook's Shared
Secret as plain text in `X-Honeycomb-Webhook-Token`; the handler compares the whole value with
`HONEYCOMB_WEBHOOK_SECRET` using `hmac.compare_digest` on bytes. A static shared credential
authenticates the sender, not the body, and gives no replay protection, so use HTTPS and rotate
the secret if it leaks.

The route uses `api_route` for GET, POST, PUT, PATCH and DELETE (Honeycomb's docs don't name the
method), reads the body with `await request.body()` so any content type works, and a dependency
checks the secret before the body is read. An empty body is fine.

## Prerequisites

- Python 3.9+
- A Honeycomb webhook integration with a Shared Secret (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `HONEYCOMB_WEBHOOK_SECRET` to the Shared Secret you entered on the Honeycomb webhook.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `/webhooks/honeycomb`.

## Test

```bash
pytest test_webhook.py -v
```

The tests cover every accepted method with correct, wrong and missing secrets, empty and invalid
bodies, alert classification and duplicate delivery IDs. No Honeycomb account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/honeycomb \
  -H "Content-Type: application/json" \
  -H "X-Honeycomb-Webhook-Token: $HONEYCOMB_WEBHOOK_SECRET" \
  -d '{"kind":"trigger","status":"TRIGGERED"}'
```

That body is what a custom Trigger payload template with a `kind` field renders (see SKILL.md).
Honeycomb doesn't document its standard payload field by field.

## Receive Webhooks Locally

Honeycomb can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 honeycomb --path /webhooks/honeycomb
```

Put the printed URL in the Honeycomb webhook integration.

## How It Works

- `main.py`: `verify_honeycomb_request()`, `classify_alert()` and the `/webhooks/honeycomb` route

1. The `X-Honeycomb-Webhook-Token` header is checked first, for every method. Failure returns `401`.
2. A repeated `X-Honeycomb-Webhook-Delivery-ID` is acknowledged without reprocessing.
3. An empty body is accepted; otherwise the body must be a JSON object (`400` otherwise).
4. The handler classifies the alert by the `kind` field your payload templates set (`trigger`,
   `budget_rate`, `exhaustion_time` or `anomaly`), and anything else as `unknown`.
5. It returns `200 {"received": true}`. Honeycomb expects a response within 15 seconds.
