# SendX Webhooks - FastAPI Example

Minimal example of receiving SendX webhooks with signature verification.

## Prerequisites

- Python 3.10+
- A SendX account and your team API key

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
3. Add your SendX team API key (Settings → Team API Key) to `.env` as `SENDX_WEBHOOK_SECRET`.
   SendX signs webhooks with it.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 sendx --path /webhooks/sendx
```

Then set the Hookdeck URL as the webhook URL in SendX. The route reads the raw bytes with
`await request.body()` before verifying.
