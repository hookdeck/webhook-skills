# Webex Webhooks - FastAPI Example

Minimal example of receiving Webex webhooks with `X-Spark-Signature` verification.

## Prerequisites

- Python 3.9+
- A Webex bot or integration token, and a webhook created with a `secret`
  (see [../../references/setup.md](../../references/setup.md))

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

3. Add the `secret` you chose when creating the webhook to `.env` as `WEBEX_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests (they generate real HMAC-SHA1 signatures):

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 webex --path /webhooks/webex
```

Use the printed URL (with the `/webhooks/webex` path) as the `targetUrl` when you
create the webhook with `POST https://webexapis.com/v1/webhooks`.

### Trigger Test Events

- Post a message in a room your bot is in (`messages.created`)
- Add or remove someone in a group room (`memberships.created` / `memberships.deleted`)
- Create or lock a room (`rooms.created` / `rooms.updated`)

## Endpoint

- `POST /webhooks/webex` - Verifies `X-Spark-Signature` and processes Webex webhook events
