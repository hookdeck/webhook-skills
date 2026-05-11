# HubSpot Webhooks - FastAPI Example

Minimal example of receiving HubSpot webhooks with `X-HubSpot-Signature-v3` verification using FastAPI.

## Prerequisites

- Python 3.9+
- A HubSpot app with webhook subscriptions and its Client Secret

## Setup

1. Create virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your HubSpot app Client Secret to `.env`

## Run

```bash
uvicorn main:app --reload --port 3000
```

Server runs on http://localhost:3000

## Test

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 hubspot --path /webhooks/hubspot
```

Use the printed Hookdeck URL as the **Target URL** for your HubSpot app's webhook subscriptions.

## Endpoint

- `POST /webhooks/hubspot` - Receives and verifies HubSpot webhook events
