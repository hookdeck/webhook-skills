# Holded Webhooks - FastAPI Example

Minimal example of receiving Holded webhooks with signature verification.

## Prerequisites

- Python 3.10+
- Holded account with a webhook configured under Settings > Webhooks

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

3. Add your Holded webhook secret to `.env`. Paste the whole value, including the `whsec_` prefix: Holded uses it as a plain HMAC key (this is not Standard Webhooks, so don't use `svix` or `standardwebhooks`).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, webhook endpoint `POST /webhooks/holded`.

## Test

```bash
pytest test_webhook.py
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 8000 holded --path /webhooks/holded
```

Register the Hookdeck URL in Holded under Settings > Webhooks, then create or update an invoice or contact.
