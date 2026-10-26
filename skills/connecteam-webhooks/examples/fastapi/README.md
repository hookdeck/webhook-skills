# Connecteam Webhooks - FastAPI Example

Minimal example of receiving Connecteam webhooks and authenticating them with the `x-webhook-secret` header.

Connecteam webhooks are **not signed**. When you set a `secretKey` on the webhook, Connecteam sends that exact value in the `x-webhook-secret` header and does not sign or hash the body. The check proves who sent the request, not that the body is untouched, and it gives no replay protection. Use HTTPS and rotate the secret if it leaks.

## Prerequisites

- Python 3.9+
- A Connecteam webhook created through the Connecteam Webhook API **with a `secretKey`**

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

3. Put the webhook's `secretKey` in `.env` as `CONNECTEAM_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. The route accepts GET, POST, PUT, PATCH and DELETE at `/webhooks/connecteam` (the docs don't name the method outside the Chat guide), checks the credential first for every method, and returns 200 for an empty body.

## Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 connecteam --path /webhooks/connecteam
```

Use the URL it prints as the `url` when you create the webhook through the Connecteam API.

## Test

```bash
pytest test_webhook.py
```

Or send a request by hand:

```bash
curl -X POST http://localhost:8000/webhooks/connecteam \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $CONNECTEAM_WEBHOOK_SECRET" \
  -d '{"requestId":"1","company":"123","activityType":"User","eventTimestamp":1731595939,"eventType":"user_created","data":[{"userId":1}]}'
```
