# Agora Webhooks - FastAPI Example

Minimal example of receiving Agora webhooks with signature verification (`Agora-Signature`, HMAC-SHA1 hex of the raw body).

## Prerequisites

- Python 3.9+
- An Agora project with a webhook and its Signing Secret

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Signing Secret to `.env` as `AGORA_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000 and receives webhooks at `POST /webhooks/agora`. The body is read as raw bytes and parsed only after the signature check. Invalid signatures get `401`.

## Test

Run the automated tests (they generate real HMAC-SHA1 signatures):

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 agora --path /webhooks/agora
```

Put the printed URL in the webhook URL field in Agora Console.
