# Lithic Webhooks - FastAPI Example

Minimal example of receiving Lithic webhooks with signature verification using the official `lithic` Python SDK.

## Prerequisites

- Python 3.9+
- Lithic account with an event subscription and signing secret

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

   Signature verification uses the optional `standardwebhooks` package (included
   in `requirements.txt`; also available via `pip install "lithic[webhooks]"`).

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your Lithic webhook signing secret (starts with `whsec_`) to `.env`. Read it with `GET /v1/event_subscriptions/{event_subscription_token}/secret`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000.

## Test

```bash
pytest test_webhook.py
```

## Receive Webhooks Locally

Use the Hookdeck CLI — no account required, one paste-and-run line:

```bash
npx hookdeck-cli listen 8000 lithic --path /webhooks/lithic
```

The CLI prints a public URL. Register it as your event subscription URL with `POST /v1/event_subscriptions`, then send a sandbox example with `POST /v1/simulate/event_subscriptions/{event_subscription_token}/send_example` (or replay events from the Hookdeck UI).

## Endpoint

- `POST /webhooks/lithic` — Receives and verifies Lithic webhook events
- `GET /health` — Health check
