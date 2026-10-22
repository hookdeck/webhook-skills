# Confluence Webhooks - FastAPI Example

Minimal example of receiving Confluence **Data Center** webhooks with `X-Hub-Signature` verification. (Confluence Cloud is not covered.)

## Prerequisites

- Python 3.10+
- Confluence Data Center with a webhook that has a secret set

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

3. Put the webhook's secret in `.env` as `CONFLUENCE_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 confluence --path /webhooks/confluence
```

Then use the Hookdeck URL as the webhook URL in Administration > General Configuration > Webhooks, and publish or edit a page.
