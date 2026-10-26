# Baseten Webhooks - FastAPI Example

Minimal example of receiving Baseten async inference webhooks with `X-BASETEN-SIGNATURE` verification.

## Prerequisites

- Python 3.10+
- Baseten account with a webhook secret (Settings → Secrets)

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

3. Add your Baseten webhook secret to `.env`. Create a webhook secret in the Baseten Secrets tab and paste it here. Without one, deliveries are unsigned and fail verification.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts `POST /webhooks/baseten`.

## Test

Run the automated tests (they generate real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 8000 baseten --path /webhooks/baseten
```

Pass the tunnel URL as `webhook_endpoint` when calling `/async_predict`.

## Notes

- The handler reads `await request.body()` in a dependency so the exact bytes are verified; JSON is parsed only afterwards.
- Bad or missing signatures return `401`. Baseten only retries `500`/`502`/`503`/`504`, once.
