# Freemius Webhooks - Next.js Example

Minimal example of receiving Freemius webhooks in a Next.js App Router route with
`x-signature` verification (bare hex HMAC-SHA256 of the raw body, keyed with the
product secret key).

The route reads the body with `await request.arrayBuffer()` so the exact bytes are
verified, and parses JSON only after the signature check.

## Prerequisites

- Node.js 18+
- A Freemius product and its secret key (**Settings > API & Keys** in the Developer Dashboard)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add the product secret key to `.env.local` as `FREEMIUS_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/freemius`.

## Test

Run the test suite (signs payloads with the real Freemius algorithm):

```bash
npm test
```

### Receive real webhooks locally

```bash
# Forward webhooks to localhost (no install or account required)
npx hookdeck-cli listen 3000 freemius --path /webhooks/freemius
```

Add the URL the CLI prints under **Webhooks > Listeners** in the Developer Dashboard.

## What the handler does

- Verifies `x-signature` and answers `401` when it is missing, malformed or wrong
- Parses the JSON body and dispatches on the top-level `type`
- Handles `license.activated`, `license.created`, `license.cancelled`,
  `subscription.created`, `subscription.cancelled`, `payment.created`,
  `payment.refund` and `user.created`; every other type is logged and acknowledged
- Checks the type of every nested field before reading it
