# Kontent.ai Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Kontent.ai](https://kontent.ai) webhooks and verifying the `X-Kontent-ai-Signature` HMAC-SHA256.

## Prerequisites

- Python 3.9+
- A Kontent.ai project and a webhook's Secret (see [setup](../../references/setup.md))

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

3. Set `KONTENT_AI_WEBHOOK_SECRET` in `.env` to the webhook's Secret, exactly as shown.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/kontent-ai` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover a valid signature, a hex digest (rejected), a base64-decoded secret (rejected), a CRLF body verified as sent (and rejected after its line endings are rewritten), a batch of two notifications, another secret, a tampered body, a missing header, a trailing newline in the secret, invalid JSON, and a missing secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 kontent-ai --path /webhooks/kontent-ai
```

Use the printed URL as the webhook URL, then publish or change content to trigger a notification.

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- The webhook Secret is used as text, not base64-decoded. Only `X-Kontent-ai-Signature` is checked, not the legacy `X-KC-Signature`.
