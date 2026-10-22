# Todoist Webhooks - FastAPI Example

Minimal example of receiving Todoist webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A Todoist app (App Management Console) with its Client Secret

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

3. Add your app's **Client Secret** to `.env` as `TODOIST_CLIENT_SECRET` (Todoist signs webhooks with it; there is no separate webhook secret)

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
npx hookdeck-cli listen 8000 todoist --path /webhooks/todoist
```

Set the Hookdeck URL as the webhook callback URL in the App Management Console (HTTPS, no port). Remember to complete the OAuth flow with your own account so events fire for you.

## Endpoint

- `POST /webhooks/todoist` - Verifies `X-Todoist-Hmac-SHA256` against the raw body, dedupes on `X-Todoist-Delivery-ID`, and handles events.
