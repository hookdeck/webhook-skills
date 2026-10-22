# MailerLite Webhooks - FastAPI Example

Minimal example of receiving MailerLite webhooks with signature verification.

## Prerequisites

- Python 3.9+
- MailerLite account with a webhook created through the API (the response includes its `secret`)

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

3. Add your MailerLite webhook secret to `.env`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 mailerlite --path /webhooks/mailerlite
```

Then create a MailerLite webhook (`POST https://connect.mailerlite.com/api/webhooks`) pointing at the Hookdeck URL.

## Endpoint

- `POST /webhooks/mailerlite` - Receives and verifies MailerLite webhook events (single and batched)
