# Hume Webhooks - FastAPI Example

Minimal example of receiving Hume EVI (speech-to-speech) webhooks with `X-Hume-AI-Webhook-Signature` HMAC-SHA256 verification.

## Prerequisites

- Python 3.10+
- A Hume account with an EVI Config that has a webhook URL
- Your account's webhook signing key (Developers page → **Generate signing key**)

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

3. Add your webhook signing key to `.env` as `HUME_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward Hume webhooks to your local server (no account needed)
npx hookdeck-cli listen 8000 hume --path /webhooks/hume
```

Put the HTTPS URL the CLI prints in the `webhooks` array of your EVI Config, then start a chat that uses that Config. You should see `chat_started` and `chat_ended` arrive.

### Run Unit Tests

```bash
pytest test_webhook.py -v
```

## Endpoint

- `POST /webhooks/hume` — Verifies `X-Hume-AI-Webhook-Signature` (hex HMAC-SHA256 of `{raw body}.{X-Hume-AI-Webhook-Timestamp}`) and dispatches on `event_name` (`chat_started`, `chat_ended`, `tool_call`).
- `GET /health` — Health check.

## Notes

- **Raw body is required.** A dependency reads `await request.body()`, so any content type reaches the verifier as the exact bytes Hume signed. Parsing and re-serializing the JSON breaks the signature.
- **Body first, then `.`, then the timestamp.** The order is the reverse of many other providers.
- **Missing or invalid signature returns 401.** A correctly signed body that is not JSON returns 400.
- **No timestamp window by default.** Hookdeck retries and replays resend the original timestamp. To opt in, set `HUME_WEBHOOK_TOLERANCE_SECONDS` (Unix seconds; Hume's own example uses 180).
