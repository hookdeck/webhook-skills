# Terminal49 Webhooks - FastAPI Example

Minimal example of receiving Terminal49 webhooks and verifying the `X-T49-Webhook-Signature`
header (lowercase hex HMAC-SHA256 of the raw request body, keyed with the webhook's `secret`).

The route reads the body with `await request.body()`, so any content type works and the exact bytes are verified. The body is parsed only after the signature check. No timestamp is signed, so there
is no replay window to check.

## Prerequisites

- Python 3.9+
- A Terminal49 account with a webhook (see [../../references/setup.md](../../references/setup.md))

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

3. Put the webhook's `secret` (returned when you create the webhook) in `.env` as
   `TERMINAL49_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/terminal49`.

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads shaped like Terminal49's documented `webhook_notification` JSON:API
documents with the same algorithm Terminal49 uses, and cover valid, uppercase-hex, missing, empty,
malformed, wrong and tampered signatures, plus event dispatch and duplicate deliveries. No
Terminal49 account is needed.

To try it by hand:

```bash
BODY='{"data":{"id":"test-1","type":"webhook_notification","attributes":{"event":"container.updated"}}}'
SIG=$(printf %s "$BODY" | openssl dgst -sha256 -hmac "$TERMINAL49_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST http://localhost:8000/webhooks/terminal49 \
  -H "Content-Type: application/json" \
  -H "X-T49-Webhook-Signature: $SIG" \
  -d "$BODY"
```

## Receive Webhooks Locally

Terminal49 can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 terminal49 --path /webhooks/terminal49
```

Put the printed URL in the Terminal49 dashboard (Developer > Webhooks) as the webhook URL.

## How It Works

- `main.py`: `verify_terminal49_signature()` plus the `POST /webhooks/terminal49` route

1. Read the raw body bytes and the `X-T49-Webhook-Signature` header.
2. Require exactly 64 hex characters, compute HMAC-SHA256 of the raw bytes keyed with the secret's
   UTF-8 bytes, and compare in constant time. Failure returns `401`.
3. Parse the JSON and dispatch on `data.attributes.event` (`tracking_request.succeeded`,
   `tracking_request.failed`, `container.transport.vessel_arrived`,
   `container.transport.vessel_departed`, `container.transport.available`, `container.updated`,
   `shipment.estimated.arrival`; others are logged).
4. Skip a `data.id` already processed (retries can repeat a notification).
5. Return `200 {"received": true}`. A handler error returns `500` so Terminal49 retries.
