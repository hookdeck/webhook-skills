# Modern Treasury Webhooks - FastAPI Example

Minimal example of receiving Modern Treasury webhooks with `X-Signature` (HMAC-SHA256) verification.

## Prerequisites

- Python 3.9+
- Modern Treasury account with a webhook endpoint and its webhook key

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Modern Treasury webhook key (Developers > Webhooks) to `.env` as `MODERN_TREASURY_WEBHOOK_KEY`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the automated tests (they generate real signatures):

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally, run the Hookdeck CLI and use the URL it prints as the endpoint URL in Modern Treasury:

```bash
npx hookdeck-cli listen 8000 modern-treasury --path /webhooks/modern-treasury
```

## Endpoint

- `POST /webhooks/modern-treasury` - Verifies `X-Signature` in a dependency, dispatches on `X-Topic` + body `event`, and de-duplicates on `X-Webhook-ID`
