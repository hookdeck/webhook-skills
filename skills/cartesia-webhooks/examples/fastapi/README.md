# Cartesia Webhooks - FastAPI Example

Minimal example of receiving Cartesia (Line voice agent) webhooks with FastAPI.

Cartesia does not sign the payload. It sends the secret you set on the webhook, unchanged,
in the `x-webhook-secret` header. A FastAPI dependency compares it to
`CARTESIA_WEBHOOK_SECRET` with a constant-time comparison before the body is parsed.

## Prerequisites

- Python 3.9+
- A Cartesia account with an agent and a webhook (see [../../references/setup.md](../../references/setup.md))

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

3. Set `CARTESIA_WEBHOOK_SECRET` to the same value you entered as the webhook's secret in
   Cartesia (`openssl rand -hex 32` makes a good one).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts events at `POST /webhooks/cartesia`.

## Test

```bash
pytest test_webhook.py
```

The tests cover correct, wrong and missing secrets, every documented event type, and
duplicate delivery. No Cartesia account is needed.

## Receive Webhooks from Cartesia Locally

Cartesia needs a public `https` URL. Tunnel to your machine with the Hookdeck CLI (no
account, no install):

```bash
npx hookdeck-cli listen 8000 cartesia --path /webhooks/cartesia
```

Use the printed URL as the webhook URL in Cartesia.

## How It Works

- `main.py`: `verify_cartesia_request()`, the `require_cartesia_secret` dependency and the route

1. `x-webhook-secret` is checked by the dependency before the body is read. Failure returns
   `401`, which Cartesia treats as permanent (no retry).
2. The body must be a JSON object (`400` otherwise).
3. Events with an already-seen `webhook_request_id` are acknowledged without reprocessing.
4. The handler dispatches on `type`: `call_started`, `call_completed`, `call_failed`,
   `call_turn`, `post_call_analysis`, then returns `200 {"received": true}`.
