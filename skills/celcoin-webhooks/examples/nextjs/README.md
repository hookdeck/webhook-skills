# Celcoin Webhooks - Next.js Example

Minimal example of receiving Celcoin webhooks in the App Router and authenticating them with HTTP Basic auth. Celcoin does not sign payloads.

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
   cp .env.example .env.local
   ```

3. Put the `login` and `pwd` from your subscription into `.env.local` as `CELCOIN_WEBHOOK_USERNAME` and `CELCOIN_WEBHOOK_PASSWORD`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The route `app/webhooks/celcoin/route.ts` exports a handler for GET, POST, PUT, PATCH and DELETE; the verification helpers live in `lib/verify-celcoin.ts`.

## Test

```bash
npm test
```

To receive real notifications locally, tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 celcoin --path /webhooks/celcoin
```
