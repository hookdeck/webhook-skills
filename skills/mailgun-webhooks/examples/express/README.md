# Mailgun Webhooks - Express Example

Minimal example of receiving Mailgun webhooks with HMAC-SHA256 signature verification.

## Prerequisites

- Node.js 18+
- Mailgun account with the HTTP Webhook Signing Key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `MAILGUN_WEBHOOK_SIGNING_KEY` in `.env` to the HTTP webhook signing key from your Mailgun dashboard (**Sending → API Keys → HTTP webhook signing key**).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/mailgun`.

## Test

### With Mailgun's "Test webhook" button

1. Expose your local server publicly (Mailgun cannot reach `localhost`):
   ```bash
   npx hookdeck-cli listen 3000 mailgun --path /webhooks/mailgun
   ```
2. In Mailgun dashboard, create a webhook pointing at the public URL the CLI prints.
3. Click **Test webhook** — your server should log the event and respond `200`.

### With the unit tests

```bash
npm test
```

The tests generate real Mailgun-style signatures using HMAC-SHA256 over `timestamp + token` and exercise valid, invalid, tampered, and missing-signature cases plus every common event type.

## How It Works

Mailgun delivers the signature inside the request body as a `signature` object:

```json
{
  "signature": {
    "timestamp": "1529006854",
    "token": "a8ce0edb2dd8...",
    "signature": "d2271d12299f..."
  },
  "event-data": { "event": "delivered", "recipient": "alice@example.com", ... }
}
```

The handler:

1. Parses JSON (safe — the signature only covers `timestamp + token`, not the body).
2. Computes `HMAC-SHA256(signing_key, timestamp + token)` in hex.
3. Compares against `signature.signature` using `crypto.timingSafeEqual`.
4. Dispatches on `event-data.event`.
