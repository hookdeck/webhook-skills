# Okta Webhooks - FastAPI Example

Minimal example of receiving Okta Event Hooks with FastAPI: the one-time
verification handshake (GET) and authenticated event delivery (POST).

## Prerequisites

- Python 3.10+
- An Okta org where you can create an event hook (see [../../references/setup.md](../../references/setup.md))
- The `Authorization` secret you registered with the hook

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

3. Set `OKTA_WEBHOOK_SECRET` in `.env` to the same value you registered as the
   event hook's Authorization secret.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook is at `http://localhost:8000/webhooks/okta`.

## How It Works

- **`GET /webhooks/okta`** — Responds to Okta's verification challenge by echoing
  the `x-okta-verification-challenge` header as `{"verification": "<challenge>"}`.
- **`POST /webhooks/okta`** — Verifies the `Authorization` header (timing-safe,
  via `hmac.compare_digest`) against `OKTA_WEBHOOK_SECRET`, then iterates
  `data.events[]` and dispatches on each event's `eventType`.

Okta Event Hooks have **no HMAC signature** — authentication is the static
`Authorization` header value.

## Test

```bash
pytest test_webhook.py
```

## Receive Real Webhooks Locally

Expose your local server with the Hookdeck CLI — no account or install required:

```bash
npx hookdeck-cli listen 8000 okta --path /webhooks/okta
```

Use the printed public URL as your event hook endpoint in the Okta Admin Console,
then click **Verify** to complete the handshake.
