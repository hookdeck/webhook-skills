# Fiber AI Webhooks - FastAPI Example

FastAPI example for receiving Fiber AI webhooks (delivered through Svix) using the
official [`svix`](https://pypi.org/project/svix/) Python library.

## Prerequisites

- Python 3.9+
- A Fiber AI account with a webhook endpoint and its `whsec_` signing secret

## Setup

1. Create a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your signing secret to `.env` (`FIBER_AI_WEBHOOK_SECRET`)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

Tests sign payloads with the same algorithm Fiber AI uses
(`HMAC-SHA256` over `{svix-id}.{svix-timestamp}.{raw body}`).

To send a real signed delivery, use the `sendTestWebhookEvent` API operation or
the "Send Example" button in the Fiber webhook portal.

## Webhook Endpoint

```
POST http://localhost:8000/webhooks/fiber-ai
```

## Notes

- The `svix` library always enforces a 5-minute timestamp window. Hookdeck retries and
  replays resend the original timestamp, so late retries fail verification; see
  `../../references/verification.md` for a manual verifier where the window can be dropped.

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 8000 fiber-ai --path /webhooks/fiber-ai
```

Use the printed URL as the endpoint URL in Fiber AI (it must be HTTPS).
