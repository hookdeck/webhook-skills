# Auth0 Webhooks - FastAPI Example

Minimal example of receiving Auth0 **Custom Log Stream** events with FastAPI and
validating the configured Authorization token.

## Prerequisites

- Python 3.10+
- An Auth0 tenant with a **Custom Log Stream (Webhook)** — see
  [../../references/setup.md](../../references/setup.md)

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

3. Set `AUTH0_LOG_STREAM_TOKEN` in `.env` to the same value you configured as the
   log stream's **Authorization Token** in the Auth0 Dashboard.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is served at `POST http://localhost:8000/webhooks/auth0`.

## Test

```bash
pytest test_webhook.py -v
```

## Receive Real Events Locally

Use the Hookdeck CLI to tunnel Auth0 events to your local server — no account,
no install:

```bash
npx hookdeck-cli listen 8000 auth0 --path /webhooks/auth0
```

Use the printed URL as the **Payload URL** of your Auth0 log stream.

## How It Works

1. Auth0 batches log events and `POST`s them as a **JSON array**.
2. The handler compares the `Authorization` header to `AUTH0_LOG_STREAM_TOKEN`
   with a constant-time comparison (`401` if it doesn't match).
3. It processes each record by its `data.type` code and returns `200` (Auth0
   retries on non-`2xx`).
