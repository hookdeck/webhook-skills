# Rewardful Webhooks - FastAPI Example

Minimal example of receiving Rewardful webhooks with signature verification.

Rewardful sends `X-Rewardful-Signature`: the lowercase hex HMAC-SHA256 of the raw request body,
keyed with the endpoint's Signing Secret. Rewardful has no Python verification helper, so the
handler verifies manually. The route reads `await request.body()`, so any content type works and
the exact bytes are verified, and parses the JSON only after the check.

## Prerequisites

- Python 3.9+
- A Rewardful account with an endpoint and its Signing Secret (see [../../references/setup.md](../../references/setup.md))

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

3. Set `REWARDFUL_WEBHOOK_SECRET` in `.env` to the endpoint's Signing Secret from the Webhooks
   page in the Rewardful dashboard.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/rewardful`.

## Test

```bash
pytest test_webhook.py
```

The tests sign the documented `affiliate.confirmed` payload and every handled event with the same
algorithm as Rewardful, and cover wrong, missing, malformed and tampered signatures.

## Receive Webhooks Locally

Rewardful can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 rewardful --path /webhooks/rewardful
```

Put the printed URL in the endpoint's URL field on the Rewardful Webhooks page.

## How It Works

- `main.py`: `verify_rewardful_signature()` plus the `POST /webhooks/rewardful` route

1. The raw body bytes and `X-Rewardful-Signature` are checked first (64 hex characters, then
   `hmac.compare_digest` on bytes). Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. A repeated `event.id` is acknowledged with `200` and skipped.
4. The handler dispatches on `event.type` and logs events it doesn't handle.
5. It returns `200 {"received": true}`; Rewardful treats any other status as a failure and retries.
