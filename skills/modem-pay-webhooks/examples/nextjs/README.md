# Modem Pay Webhooks - Next.js Example

Minimal example of receiving Modem Pay webhooks with `x-modem-signature` verification.

## Prerequisites

- Node.js 18+
- A Modem Pay webhook secret (dashboard: Developers > Webhooks), or the test secret printed by `modempay listen`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook secret to `.env` (`MODEM_PAY_WEBHOOK_SECRET`), exactly as Modem Pay shows it.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 (the route is `POST /webhooks/modem-pay`)

The route reads the raw body with `await request.arrayBuffer()` (verification lives in `lib/modem-pay.ts`). It checks `x-modem-signature` = hex HMAC-SHA512 of the raw body (128 characters, compared case-insensitively in constant time) before parsing anything, and answers 401 when the header is missing, malformed or wrong. A signed body that isn't a JSON object with a string `event` and an object `payload` gets 400. Unknown events are acknowledged with 200 so Modem Pay doesn't retry them.

## Test

```bash
npm test
```

To receive real webhooks locally, either use Modem Pay's CLI in test mode:

```bash
modempay listen --forward-url=http://localhost:3000/webhooks/modem-pay
modempay trigger charge.succeeded
```

or a Hookdeck tunnel (register the URL it prints with Modem Pay):

```bash
npx hookdeck-cli listen 3000 modem-pay --path /webhooks/modem-pay
```
