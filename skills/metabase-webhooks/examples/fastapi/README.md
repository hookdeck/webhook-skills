# Metabase Webhooks - FastAPI Example

Minimal example of receiving Metabase alert webhooks, authenticating the HTTP Basic credentials.

Metabase does not sign webhooks. Choose **Basic** authentication on the webhook and the request carries `Authorization: Basic base64(username:password)`.

## Prerequisites

- Python 3.9+
- A Metabase webhook (Admin > Settings > Webhooks) using Basic authentication

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

3. Put the username and password you set on the Metabase webhook in `.env`
   (`METABASE_WEBHOOK_USERNAME`, `METABASE_WEBHOOK_PASSWORD`).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

To receive real alerts locally, tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 metabase --path /webhooks/metabase
```

Use the printed URL as the webhook URL in Metabase, then send a test alert.

## Notes

- A static shared credential authenticates the sender, not the body, and gives no replay protection. Use HTTPS and rotate the credential if it leaks.
- The credential check is a FastAPI dependency, so it runs before the body is parsed; the raw body is then read with `request.body()` so any content type works.
