# Dropbox Webhooks - FastAPI Example

Minimal example of receiving Dropbox API webhooks with the `challenge` verification request and `X-Dropbox-Signature` verification.

## Prerequisites

- Python 3.9+
- A Dropbox API app with its App secret

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

3. Add your Dropbox App secret (App Console > Settings) to `.env` as `DROPBOX_APP_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests (they generate real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 dropbox --path /webhooks/dropbox
```

Add the Hookdeck URL as the Webhook URI in the Dropbox App Console. Dropbox sends the `challenge` GET first, and the server must be running to answer it.

## Endpoints

- `GET /webhooks/dropbox` - answers the `challenge` verification request
- `POST /webhooks/dropbox` - verifies `X-Dropbox-Signature`, then processes `list_folder` notifications
