# Tidio Webhooks - FastAPI Example

Minimal example of receiving Tidio webhooks with signature verification using
FastAPI. Tidio has no webhook SDK, so the `x-tidio-signature` header is verified
**manually** with Python's `hmac` module.

## Prerequisites

- Python 3.9+
- A Tidio project on the Plus or Premium plan (webhooks are not available on lower plans)
- The webhook secret from Settings > Developer > Webhooks

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

3. Add your Tidio webhook secret to `.env`:
   ```bash
   TIDIO_WEBHOOK_SECRET=your_tidio_webhook_secret
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 with the webhook endpoint at `POST /webhooks/tidio`.

## Test

```bash
pytest test_webhook.py
```

The tests generate real signatures (`HMAC-SHA256` over `<body>_<t>`, hex) in the
`x-tidio-signature` format.

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Tidio webhooks to your local server (no account required):

```bash
npx hookdeck-cli listen 8000 tidio --path /webhooks/tidio
```

Paste the public URL the CLI prints into Tidio under Settings > Developer > Webhooks.

## How It Works

- The route reads `await request.body()` so the **raw body bytes** are verified whatever
  the content type; JSON is parsed only after the check.
- `x-tidio-signature` is `t=<unix seconds>,s=<hex>[,s=<hex>...]`. The signed bytes are
  the raw body, a literal `_`, then the `t` value. The request is valid when **any** `s`
  matches (there is one per active webhook secret).
- Signatures are format-checked (64 hex characters) and compared in constant time with
  `hmac.compare_digest` on bytes.
- Missing or malformed header, or a mismatch, returns `401`. Verified deliveries return `200`.
- Old timestamps are **not** rejected by default (Hookdeck retries and replays resend the
  original headers). Set `TIDIO_WEBHOOK_TOLERANCE_SECONDS` to opt in to a window.
- The event type is the body's `topic`. Duplicates are skipped by `webhook_id`
  (in memory here; use a shared store in production).
