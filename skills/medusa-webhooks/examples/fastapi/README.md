# Medusa Webhooks - FastAPI Example

Minimal example of receiving Medusa Cloud webhooks with `X-Medusa-Signature` verification.

## Prerequisites

- Python 3.9+
- A Medusa Cloud organization (Launch, Scale, or Enterprise plan) with a webhook endpoint and its signing secret

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your endpoint's signing secret (the **Signing Secret** on the endpoint card in Cloud) to `.env` as `MEDUSA_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/medusa`.

## Test

Run the tests (they generate real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 medusa --path /webhooks/medusa
```

Use the tunnel URL as the **Endpoint URL** on **Webhooks > Endpoints** in Medusa Cloud, then push a commit to trigger a build (`build.created`).

## How verification works

The `X-Medusa-Signature` header is `t=<unix>,v1=<hex>`. The handler reads the raw body with `await request.body()` (any content type), computes `hex(HMAC-SHA256(secret, "<t>.<rawBody>"))`, compares it timing-safely with `v1`, and leaves the timestamp check off by default: Medusa re-signs its own retries, but Hookdeck retries and replays resend the original `t`. Set `MEDUSA_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds (the docs suggest `300`) to turn it on. See [../../references/verification.md](../../references/verification.md).
