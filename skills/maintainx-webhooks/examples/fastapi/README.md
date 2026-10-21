# MaintainX Webhooks - FastAPI Example

Minimal example of receiving MaintainX webhooks with signature verification.

## Prerequisites

- Python 3.10+
- MaintainX account with a webhook (Settings > Integrations > Webhooks) and its secret

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

3. Add your webhook secret (Settings > Integrations > **Copy secret**) to `.env` as `MAINTAINX_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, webhook endpoint `POST /webhooks/maintainx`.

## Test

Run the automated tests (they generate real `t=<unix>,v1=<hex>` signatures):

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally, start a tunnel (no account required):

```bash
npx hookdeck-cli listen 8000 maintainx --path /webhooks/maintainx
```

Use the Hookdeck URL as the webhook **Endpoint** in MaintainX, then create a work order to trigger `NEW_WORK_ORDER`.

## How Verification Works

The `x-maintainx-webhook-body-signature` header is `t=<unix>,v1=<hex>`. `v1` is HMAC-SHA256 (hex) over `{t}.{raw body}` keyed with the webhook secret. The handler reads `await request.body()` so the bytes stay unparsed, compares with `hmac.compare_digest`, and leaves the timestamp check off by default because retries and replays keep the original timestamp. Set `MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds (MaintainX suggests `300`) to turn it on. MaintainX has no Python SDK helper, so verification is manual.
