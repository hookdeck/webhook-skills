# Metronome Webhooks - FastAPI Example

Minimal example of receiving Metronome webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Metronome account with a webhook and its secret key

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

3. Add your Metronome webhook secret key to `.env` as `METRONOME_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

The tests include the worked example from Metronome's docs (secret `correct-horse-battery-staple`, signature `b82652fa2246cf1d8a27e591f155c865f68b46c19b9213fd9c052f2419b4742b`).

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 metronome --path /webhooks/metronome
```

Paste the URL the CLI prints into your Metronome webhook configuration.

## Notes

- The handler reads `await request.body()` so the exact bytes are verified for any content type; the JSON is parsed only after the check.
- The signature covers `X-Metronome-Date`, a newline (LF), then the raw body. Failures return `401`.
- Old `X-Metronome-Date` values are accepted by default (retries and replays resend them). Set `METRONOME_WEBHOOK_TOLERANCE_SECONDS` to opt in to a window.
- Duplicates are possible: the handler dedupes on the body's `id` (in memory here; use a shared store in production).
