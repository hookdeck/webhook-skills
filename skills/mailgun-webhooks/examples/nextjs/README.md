# Mailgun Webhooks - Next.js Example

Minimal example of receiving Mailgun webhooks in a Next.js App Router route handler.

## Prerequisites

- Node.js 18+
- Mailgun account with HTTP Webhook Signing Key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `MAILGUN_WEBHOOK_SIGNING_KEY` to the HTTP webhook signing key from your Mailgun dashboard (**Sending → API Keys**).

## Run

```bash
npm run dev
```

Webhook endpoint: `POST http://localhost:3000/webhooks/mailgun`.

## Test

```bash
npm test
```

The tests generate Mailgun-style signatures (HMAC-SHA256 over `timestamp + token`) and exercise valid, invalid, tampered, and missing-signature cases plus every common event type.

For end-to-end testing with the live Mailgun dashboard, tunnel localhost with:

```bash
npx hookdeck-cli listen 3000 mailgun --path /webhooks/mailgun
```

## How It Works

The signature lives in the request **body**, not a header:

```json
{
  "signature": {
    "timestamp": "1529006854",
    "token": "...50 chars...",
    "signature": "...hex digest..."
  },
  "event-data": { "event": "delivered", ... }
}
```

The route handler in `app/webhooks/mailgun/route.ts`:

1. Parses the JSON body.
2. Reads `body.signature`.
3. Computes `HMAC-SHA256(signing_key, timestamp + token)` and compares with `timingSafeEqual`.
4. Dispatches on `body['event-data'].event`.
