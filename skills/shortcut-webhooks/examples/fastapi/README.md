# Shortcut Webhooks - FastAPI Example

Minimal example of receiving Shortcut outgoing webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Shortcut workspace where you can create an Outgoing Webhook
- A secret string entered when creating the webhook (Shortcut only signs events when a secret is set)

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

3. Add your webhook secret to `.env` as `SHORTCUT_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts `POST /webhooks/shortcut`.

## Test

```bash
pytest test_webhook.py -v
```

To receive real events locally:

```bash
npx hookdeck-cli listen 8000 shortcut --path /webhooks/shortcut
```

Use the URL the CLI prints as the webhook URL in Shortcut, with the same secret as `SHORTCUT_WEBHOOK_SECRET`, then edit a story.
