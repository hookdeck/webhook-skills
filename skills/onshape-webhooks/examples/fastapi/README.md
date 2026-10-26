# Onshape Webhooks - FastAPI Example

Minimal example of receiving [Onshape](https://www.onshape.com/) webhooks with `X-onshape-webhook-signature-primary` signature verification (base64 HMAC-SHA256 of `{timestamp}.{body}`).

## Prerequisites

- Python 3.9+
- An Onshape Enterprise company with a webhook signature key (Company/Enterprise settings > Webhooks)

> Onshape signature keys are an Enterprise company setting. Paste the primary key; only the primary signature is verified.

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

3. Add the **primary** signature key to `.env` as `ONSHAPE_WEBHOOK_SECRET`. Optionally set `ONSHAPE_WEBHOOK_TOLERANCE_SECONDS` to reject stale deliveries (off by default).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 onshape --path /webhooks/onshape
```

Use the printed URL as the `url` when you register the webhook (`POST /api/v6/webhooks`).

### Send a signed request by hand

```bash
BODY='{"timestamp":"2024-05-05T23:46:29.284-0500","event":"webhook.ping","webhookId":"000000000000000000000000","messageId":"000000000000000000000000"}'
TS='2024-05-05T23:46:29.284-0500'
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$ONSHAPE_WEBHOOK_SECRET" -binary | openssl base64 -A)
curl -X POST http://localhost:8000/webhooks/onshape \
  -H 'Content-Type: application/json' \
  -H "X-onshape-webhook-timestamp: $TS" \
  -H "X-onshape-webhook-signature-primary: $SIG" -d "$BODY"
```

### Run tests

```bash
pytest test_webhook.py
```

## Endpoint

- `POST /webhooks/onshape` - Receives and verifies Onshape events (`onshape.model.lifecycle.changed`, `onshape.model.translation.complete`, `onshape.document.lifecycle.created`, `onshape.document.lifecycle.statechange`, `onshape.revision.created`, `onshape.comment.create`, `onshape.user.lifecycle.updateappsettings`, plus `webhook.register`, `webhook.ping`, `webhook.unregister`). The body is read with `await request.body()`. Invalid or missing signatures get 401.
