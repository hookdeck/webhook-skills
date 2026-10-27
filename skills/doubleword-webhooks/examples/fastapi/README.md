# Doubleword Webhooks - FastAPI Example

Minimal example of receiving Doubleword batch webhooks (`batch.completed`, `batch.failed`) with Standard Webhooks signature verification.

## Prerequisites

- Python 3.9+
- Doubleword account with a webhook URL and signing key (profile page)

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

3. Add your signing key (including the `whsec_` prefix) to `.env` as `DOUBLEWORD_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. The route is `POST /webhooks/doubleword`.

## Test

```bash
pytest test_webhook.py
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 8000 doubleword --path /webhooks/doubleword
```

Paste the Hookdeck URL into the webhook URL field on your Doubleword profile, then submit a small batch.

## Notes

- The handler reads `await request.body()` so the exact bytes are verified; JSON is parsed only after verification.
- `standardwebhooks` enforces a fixed 5-minute timestamp window. Retries and replays through Hookdeck keep the original timestamp, so late retries are rejected. See `references/verification.md` in the skill for a manual verifier with a configurable window.
- Headers are read as `webhook-*`, falling back to `svix-*` when `webhook-id` is absent.
