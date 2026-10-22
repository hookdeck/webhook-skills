# Truework Webhooks - FastAPI Example

Minimal example of receiving Truework webhooks (`order.completed`, `verification_request.state.change`) in FastAPI.

> **There is no signature to verify.** Truework does not sign the payload. Each webhook has an authentication token that Truework sends raw in the `X-Truework-Token` header; this example compares it with `TRUEWORK_WEBHOOK_TOKEN` using `hmac.compare_digest`. See [references/verification.md](../../references/verification.md).

## What this example shows

- A `require_truework_token` dependency authenticating **before** the body is read, so any content type is handled
- Constant-time comparison (both sides hashed with SHA-256, then `hmac.compare_digest`)
- **Fail closed:** `500` when `TRUEWORK_WEBHOOK_TOKEN` is unset, `401` on a missing or wrong token
- Dispatch on `hook.event`: `order.completed` and `verification_request.state.change`

## Prerequisites

- Python 3.9+
- A Truework service account with a webhook configured (Developer Settings)

## Setup

1. Create a virtualenv and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `TRUEWORK_WEBHOOK_TOKEN` to the token shown for your webhook under Developer Settings > Webhooks. A recreated webhook gets a new token.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

Send a request by hand:

```bash
curl -X POST http://localhost:8000/webhooks/truework \
  -H "Content-Type: application/json" \
  -H "X-Truework-Token: $TRUEWORK_WEBHOOK_TOKEN" \
  -d '{"version":"2023-10-30","hook":{"id":1,"event":"order.completed","target":"http://localhost:8000/webhooks/truework"},"data":{"order_id":"ord_123"}}'
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 truework --path /webhooks/truework
```

No account required. Use the printed public URL as the webhook URL in Truework's Developer Settings.

## Endpoint

- `POST /webhooks/truework`: `500` if no token is configured, `401` on a missing or wrong token, `400` on malformed JSON, `200` otherwise. Failed deliveries are retried for up to 48 hours.
- `GET /health`: health check.
