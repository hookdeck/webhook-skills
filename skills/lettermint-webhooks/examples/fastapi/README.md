# Lettermint Webhooks - FastAPI Example

Minimal example of receiving Lettermint webhooks with `X-Lettermint-Signature` verification.

## Prerequisites

- Python 3.10+
- A Lettermint account with a webhook (Dashboard → Webhooks) and its signing secret

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

3. Add your Lettermint webhook secret to `.env` as `LETTERMINT_WEBHOOK_SECRET`. Paste the whole secret, including the whsec_ prefix. Lettermint uses it as a plain HMAC key.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/lettermint`.

## Test

Run the tests (they generate real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py -v
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 lettermint --path /webhooks/lettermint
```

Use the tunnel URL as the webhook **URL** in the Lettermint dashboard, then click **Test Webhook** on the webhook's details page.

## How verification works

The `X-Lettermint-Signature` header is `t=<unix>,v1=<hex>`. The handler reads the raw bytes with `await request.body()`, computes `HMAC-SHA256(secret, "<t>.<rawBody>")` over bytes with the whole secret (including `whsec_`) as the key, and compares it with every `v1` using `hmac.compare_digest` on bytes (any match passes) after checking each is exactly 64 hex characters. Missing or invalid signatures return `401`. The timestamp check is off by default, because retries and Hookdeck replays keep the original `t`; set `LETTERMINT_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (Lettermint's SDKs use `300`) to turn it on. See [../../references/verification.md](../../references/verification.md).
