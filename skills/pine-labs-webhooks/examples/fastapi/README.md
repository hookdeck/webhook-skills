# Pine Labs Webhooks - FastAPI Example

Minimal example of receiving Pine Labs Online webhooks with Standard Webhooks signature verification. It verifies by hand rather than with the `standardwebhooks` or `svix` library, because those base64-decode the secret and Pine Labs' secret key is used as raw UTF-8 bytes. Set `PINE_LABS_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to turn on a timestamp window (off by default, because Hookdeck retries and replays keep the original timestamp).

Headers are read from `webhook-id` / `webhook-timestamp` / `webhook-signature`, falling back to `svix-*` when `webhook-id` is absent.

## Prerequisites

- Python 3.10+
- A Pine Labs Online account and the secret key from the dashboard (Settings)

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your secret key to `.env` as `PINE_LABS_WEBHOOK_SECRET`. Paste the secret key exactly as shown in the Pine Labs dashboard, without adding a whsec_ prefix.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts `POST /webhooks/pine-labs`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 pine-labs --path /webhooks/pine-labs
```

Pine Labs registers your webhook URL during onboarding: give Pine Labs support the URL the CLI prints.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with the Standard Webhooks algorithm (HMAC-SHA256 over `{id}.{timestamp}.{body}`, key = the secret's raw UTF-8 bytes) and cover all 30 events (including the camelCase `eventType` payout events), the worked example from Pine Labs' docs, `svix-*` header fallback, other signature versions, old timestamps (accepted by default, rejected once the window is set), malformed timestamps, missing headers, duplicates, and a missing secret.
