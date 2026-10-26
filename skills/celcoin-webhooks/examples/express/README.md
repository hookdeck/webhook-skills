# Celcoin Webhooks - Express Example

Minimal example of receiving Celcoin webhooks and authenticating them with HTTP Basic auth. Celcoin does not sign payloads.

## Prerequisites

- Node.js 18+
- A Celcoin webhook subscription created with `auth.type` `basic` (see [references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the `login` and `pwd` from your subscription into `.env` as `CELCOIN_WEBHOOK_USERNAME` and `CELCOIN_WEBHOOK_PASSWORD`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts GET, POST, PUT, PATCH and DELETE on `/webhooks/celcoin`.

## Test

```bash
npm test
```

To receive real notifications locally, tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 celcoin --path /webhooks/celcoin
```

Or send one by hand:

```bash
curl -X POST http://localhost:3000/webhooks/celcoin \
  -u "$CELCOIN_WEBHOOK_USERNAME:$CELCOIN_WEBHOOK_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{"entity":"pix-payment-in","createTimestamp":"2025-05-07T17:30:00","status":"CONFIRMED","body":{}}'
```
