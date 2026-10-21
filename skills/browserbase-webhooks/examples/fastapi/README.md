# Browserbase Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Browserbase](https://www.browserbase.com) webhooks with Standard Webhooks signature verification, using the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package that Browserbase's docs recommend. Verification runs in a FastAPI dependency (`verified_browserbase_event`).

## Prerequisites

- Python 3.9+
- A Browserbase project, plus an API key if you register the webhook with the SDK or API
- The webhook signing secret (`whsec_...`). Browserbase shows it **only** when you create or rotate the webhook (see [setup](../../references/setup.md))

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

3. Add your Browserbase webhook signing secret to `BROWSERBASE_WEBHOOK_SECRET` in `.env`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/browserbase`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with Browserbase's algorithm and cover every documented event type, tampered bodies, malformed signature headers, stale timestamps, multiple signatures, secret rotation, redeliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 browserbase --path /webhooks/browserbase
```

Register the printed `https://` URL as the endpoint in Settings → Webhooks (or with `bb.webhooks.create`), subscribe to the events you want, then invoke a Function to trigger `functions.invocations.completed` or `functions.invocations.failed`.

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw bytes, so a Pydantic body model or `request.json()` before verification breaks it.
- If `BROWSERBASE_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- `BROWSERBASE_WEBHOOK_SECRET_PREVIOUS` is optional. After a rotation Browserbase keeps the old secret verifying for 24 hours, so the handler tries the current secret first and then the previous one.
- Browserbase needs a `2xx` within **15 seconds** and retries otherwise. Store or enqueue the event and process it asynchronously in production.
- Redeliveries are deduped on the envelope `id` (in memory here; use a database or cache in production).
