# Top.gg Webhooks - FastAPI Example

Minimal example of receiving Top.gg (top.gg) vote webhooks with `x-topgg-signature` verification.

## Prerequisites

- Python 3.10+
- A Top.gg project (bot or server) with a v1 webhook configured in its dashboard

Only v1 webhooks, whose secret starts with whs_, are supported. Legacy v0 webhooks aren't signed and fail verification.

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

3. Add your webhook secret (`whs_...`, generated when you save the webhook URL under your project's **Webhooks** page) to `.env` as `TOP_GG_WEBHOOK_SECRET`. Use the whole string, prefix included.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/top-gg`.

## Test

Run the tests (they generate real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py -v
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 top-gg --path /webhooks/top-gg
```

Paste the tunnel URL into your project's **Webhooks** page, then use the dashboard's test button to send a `webhook.test` event.

## How verification works

The `x-topgg-signature` header is `t=<unix>,v1=<hex>`. The handler reads the raw bytes with `await request.body()`, computes `hex(HMAC-SHA256(secret, "<t>.<raw body bytes>"))` with the `whs_` secret used whole as UTF-8 key bytes, and compares it with `hmac.compare_digest` against every `v1` entry (each must be exactly 64 hex characters). Missing, malformed or mismatched signatures get `401`. The timestamp check is off by default, because Hookdeck retries and replays keep the original `t`. Set `TOP_GG_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to turn it on. See [../../references/verification.md](../../references/verification.md).
