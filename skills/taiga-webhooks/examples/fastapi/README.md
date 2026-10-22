# Taiga Webhooks - FastAPI Example

Minimal example of receiving Taiga webhooks with signature verification (`X-TAIGA-WEBHOOK-SIGNATURE`, HMAC-SHA1).

## Prerequisites

- Python 3.10+
- A Taiga project with a webhook and its secret key (self-hosted: `WEBHOOKS_ENABLED = True`)

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

3. Add your webhook's secret key to `.env` as `TAIGA_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and receives webhooks at `POST /webhooks/taiga`.

## Test

Run the automated tests (they generate real HMAC-SHA1 signatures):

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 taiga --path /webhooks/taiga
```

Put the printed URL in the webhook's URL field in Taiga, then use the webhook's test action.
