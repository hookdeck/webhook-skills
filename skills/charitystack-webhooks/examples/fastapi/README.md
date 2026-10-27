# CharityStack Webhooks - FastAPI Example

Minimal example of receiving CharityStack webhooks with `X-Webhook-Signature` verification (HMAC-SHA256 over `{X-Webhook-Timestamp}.{raw body}`).

## Prerequisites

- Python 3.10+
- A CharityStack API key and a webhook registered with `POST /v1/webhooks` (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook `secret` from the create-webhook response to `.env` as `CHARITYSTACK_WEBHOOK_SECRET`. CharityStack shows the webhook secret only once, when you create the webhook. Paste it here.

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

The tests sign payloads with the real algorithm and cover the `sha256=` and bare-digest forms, malformed signatures, missing headers, tampered and re-serialised bodies, non-JSON content types, the opt-in timestamp tolerance, and every documented event type.

### Forward live events with the Hookdeck CLI

```bash
# No account required — first run prints a public URL
npx hookdeck-cli listen 8000 charitystack --path /webhooks/charitystack
```

Register the printed URL as the webhook `url` when you call `POST /v1/webhooks`.

## Endpoint

- `POST /webhooks/charitystack` — reads the raw body with `await request.body()` in a `Depends` dependency, verifies `X-Webhook-Signature` (401 on failure), then dispatches on the body's `type`.
- `GET /health` — liveness probe.

## Replay protection

Old timestamps are accepted by default, because retries and replays resend the original headers. To reject stale requests, set `CHARITYSTACK_WEBHOOK_TOLERANCE_SECONDS` (for example `300`).
