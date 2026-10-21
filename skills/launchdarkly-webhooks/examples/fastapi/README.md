# LaunchDarkly Webhooks - FastAPI Example

Minimal example of receiving LaunchDarkly webhooks with `X-LD-Signature` verification.

## Prerequisites

- Python 3.9+
- LaunchDarkly webhook with **Sign this webhook** enabled (signing is optional; unsigned deliveries are rejected here)

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

3. Add your webhook secret to `.env`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 launchdarkly --path /webhooks/launchdarkly
```

Use the Hookdeck URL as the webhook URL in LaunchDarkly.

## Test

```bash
pytest test_webhook.py -v
```

Tests generate real HMAC-SHA256 signatures over the raw body.
