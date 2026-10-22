# Firecrawl Webhooks - FastAPI Example

Minimal example of receiving Firecrawl webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Firecrawl account with the account webhook secret (Account settings > Advanced)

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

3. Add your Firecrawl webhook secret to `.env`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 firecrawl --path /webhooks/firecrawl
```

Then start a job with the Hookdeck URL as `webhook.url`, e.g. a crawl with `"limit": 1` and `"events": ["started", "page", "completed"]`.

## Endpoint

- `POST /webhooks/firecrawl` - Receives and verifies Firecrawl webhook events (`X-Firecrawl-Signature`). The raw body is read with `await request.body()`.
