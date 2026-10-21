# Signal Sciences Webhooks - FastAPI Example

Minimal example of receiving Signal Sciences (Fastly Next-Gen WAF) generic webhooks with `X-SigSci-Signature` verification.

## Prerequisites

- Python 3.10+
- A Fastly Next-Gen WAF generic webhook integration and its signing key

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

3. Add the integration's signing key (Reveal in the console) to `.env` as `SIGNAL_SCIENCES_SIGNING_KEY`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. The endpoint is `POST /webhooks/signal-sciences`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 signal-sciences --path /webhooks/signal-sciences
```

Use the URL it prints as the **Webhook URL** of the integration.

## Test

```bash
pytest test_webhook.py
```

Tests sign payloads with the same hex HMAC-SHA256 algorithm Fastly uses.
