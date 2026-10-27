# OpenRouter Webhooks - FastAPI Example

Minimal example of receiving OpenRouter video-generation callbacks (`callback_url`) with signature verification. OpenRouter has no webhook verification SDK, so the HMAC check is manual.

## Prerequisites

- Python 3.10+
- OpenRouter workspace with a webhook signing secret

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

3. Add your OpenRouter webhook signing secret to `.env` as `OPENROUTER_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

## Test

### Run the tests

```bash
pytest test_webhook.py -v
```

The tests sign payloads with the real OpenRouter algorithm (HMAC-SHA256 of `"<t>,<raw body>"`) and cover valid, invalid, tampered, replayed and opt-in-tolerance requests.

### Receive real callbacks locally

```bash
npx hookdeck-cli listen 8000 openrouter --path /webhooks/openrouter
```

Use the public URL the CLI prints as the `callback_url` of a `POST /api/v1/videos` request (this spends credits).

## Endpoint

- `POST /webhooks/openrouter` - Receives and verifies OpenRouter video-generation callbacks (204 / 401)
- `GET /health` - Health check
