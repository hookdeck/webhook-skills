# Auth0 Webhooks - FastAPI Example

Minimal example of receiving Auth0 **Event Streams** events with FastAPI and
checking the bearer Authorization header.

## Prerequisites

- Python 3.10+
- An Auth0 event stream with a webhook destination and bearer authorization.
  See [../../references/setup.md](../../references/setup.md)

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

3. Set `AUTH0_EVENT_STREAM_TOKEN` in `.env` to the token you set as the
   stream's bearer authorization.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at
`POST /webhooks/auth0`.

## Test

```bash
pytest test_webhook.py -v
```

## Receive Real Events Locally

Use the Hookdeck CLI to tunnel Auth0 events to your local server, with no
account and no install:

```bash
npx hookdeck-cli listen 8000 auth0 --path /webhooks/auth0
```

Use the printed URL as the event stream's webhook endpoint, then create a test
user to trigger `user.created`.

## How It Works

1. Auth0 `POST`s one CloudEvents-shaped JSON object per event.
2. The handler compares the `Authorization` header with
   `Bearer <AUTH0_EVENT_STREAM_TOKEN>` using a timing-safe comparison (`401` if
   it doesn't match).
3. It handles the event by its `type` and returns `204`. Hand slow work to a
   queue, because Auth0 retries only after 1s, 2s and 4s.
