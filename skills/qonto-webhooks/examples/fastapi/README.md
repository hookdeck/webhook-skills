# Qonto Webhooks - FastAPI Example

Minimal example of receiving Qonto Business API webhooks with signature verification (`X-Qonto-Signature`, HMAC-SHA256 over `{t}.{raw body}`).

## Prerequisites

- Python 3.9+
- A Qonto Business API webhook subscription and its secret

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

3. Add your subscription secret to `.env` as `QONTO_WEBHOOK_SECRET`. Paste the whole secret, including the whsec_ prefix. Qonto uses it as a plain HMAC key.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts `POST /webhooks/qonto`.

## Test

```bash
pytest test_webhook.py
```

The suite includes the worked example from Qonto's docs (secret `test-secret`, body `{"test":"data"}`, `t=1704110400`).

To receive real deliveries locally, use the Hookdeck CLI (no install, no account needed):

```bash
npx hookdeck-cli listen 8000 qonto --path /webhooks/qonto
```

Then use the URL it prints as the subscription's `callback_url` (`POST /v2/webhook_subscriptions`).

## Notes

- The handler reads the raw bytes with `await request.body()` and parses JSON only after verifying.
- Do not use the `standardwebhooks` or `svix` libraries: the secret looks like a Standard Webhooks one but is used whole, as a plain key, with a hex digest.
- Qonto expects a 2xx within 1 second, so the handler replies first and processes in a background task.
- Set `QONTO_WEBHOOK_TOLERANCE_SECONDS` to opt into rejecting old timestamps (off by default, since retries keep the original `t`).
