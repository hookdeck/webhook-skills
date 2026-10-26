# FullEnrich Webhooks - FastAPI Example

Minimal example of receiving FullEnrich webhooks with signature verification (`X-Signature-SHA1`, HMAC-SHA1 keyed with your API key).

## Prerequisites

- Python 3.9+
- FullEnrich account with an API key

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your FullEnrich API key to `.env` (FullEnrich has no separate webhook secret)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 fullenrich --path /webhooks/fullenrich
```

Use the printed URL as `webhook_url` (or `webhook_events.contact_finished`) in your Start Bulk Enrichment request.

## Test

```bash
pytest test_webhook.py -v
```
