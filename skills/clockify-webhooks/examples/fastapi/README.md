# Clockify Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Clockify](https://clockify.me) webhooks and verifying the `Clockify-Signature` webhook token.

## Prerequisites

- Python 3.9+
- A Clockify workspace (owner or admin) with a webhook and its Signing secret (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CLOCKIFY_WEBHOOK_SIGNING_SECRET` in `.env` to the webhook's Signing secret (comma-separate several webhooks' tokens).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/clockify` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover the configured token, other and truncated tokens, a comma-separated list, the event type header (present and absent), a second webhook's token, a missing header, an HMAC of the body (rejected), a trailing newline in the configured token, invalid JSON, and a missing token.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 clockify --path /webhooks/clockify
```

Use the printed URL as the webhook's endpoint, then trigger its event (for example, add a time entry).

## Notes

- `Clockify-Signature` is the webhook's token, not a signature of the body, so it's compared directly in constant time.
