# Lodgix Webhooks - FastAPI Example

Minimal example of receiving Lodgix webhooks with `X-Lodgix-Signature` verification.

## Prerequisites

- Python 3.9+
- A Lodgix account with a webhook endpoint (Modules > Integrations > Webhooks) and its secret

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Lodgix endpoint secret to `.env` as `LODGIX_WEBHOOK_SECRET`. Optionally set
   `LODGIX_WEBHOOK_TOLERANCE_SECONDS` (for example `300`) to enable a replay window; it is
   off by default because Hookdeck retries and replays keep the original timestamp.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the test suite (generates real HMAC-SHA256 signatures over `{timestamp}.{raw body}`):

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 lodgix --path /webhooks/lodgix
```

Use the Hookdeck-provided URL as the **Endpoint URL** of your Lodgix webhook, then trigger a
`message.received` event by receiving a guest message.

## Endpoint

- `POST /webhooks/lodgix` - Receives and verifies Lodgix webhooks (the body is read with
  `await request.body()` so the exact bytes are verified)
