# Workable Webhooks - FastAPI Example

Minimal example of receiving Workable webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A Workable account with an API token (or an OAuth application secret)

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

3. Set `WORKABLE_SIGNING_KEY` in `.env` to the API token that created the subscription (or your OAuth application secret). Workable has no separate webhook secret.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 workable --path /webhooks/workable
```

Use the URL it prints as the `target` when creating the Workable subscription.

## Notes

- The handler reads raw bytes with `await request.body()`, so verification works for any content type.
- The signature is HMAC-SHA256 of the raw body as lowercase hex. Workable's docs don't state the encoding; hex matches the n8n and Botpress integrations.

## Test

```bash
pytest test_webhook.py -v
```
