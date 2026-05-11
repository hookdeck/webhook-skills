# Slack Webhooks - FastAPI Example

Minimal example of receiving Slack Events API webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- A Slack App with **Event Subscriptions** enabled and a signing secret

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

3. Add your Slack signing secret to `.env` (Slack App → **Basic Information** → **App Credentials** → **Signing Secret**).

## Run

```bash
uvicorn main:app --reload --port 3000
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward Slack events to your local server (no account needed)
npx hookdeck-cli listen 3000 slack --path /webhooks/slack
```

Paste the Hookdeck URL into your Slack App's **Event Subscriptions → Request URL** field.

### Run Unit Tests

```bash
pytest test_webhook.py -v
```

## Endpoint

- `POST /webhooks/slack` — Verifies the `X-Slack-Signature` header, echoes the `url_verification` challenge, and dispatches `event_callback` events.
