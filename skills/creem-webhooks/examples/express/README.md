# Creem Webhooks - Express Example

Minimal example of receiving Creem webhooks and verifying the `creem-signature` header
(HMAC-SHA256 of the raw body, lowercase hex).

## Prerequisites

- Node.js 18+
- A Creem account with a webhook endpoint registered (its signing secret is on the Developers >
  Webhook page; see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CREEM_WEBHOOK_SECRET` to the endpoint's signing secret from the Developers > Webhook page.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/creem`.

## Test

```bash
npm test
```

The tests sign payloads with the same algorithm Creem uses and cover valid, tampered,
wrong-secret, random, malformed and missing signatures, any content type,
and the documented events. No Creem account is needed.

To test end to end, create a test payment in Creem's test environment, or use `creem listen
--forward-to` from the Creem CLI, which forwards events with the real signature header.

## Receive Creem Webhooks Locally

```bash
npx hookdeck-cli listen 3000 creem --path /webhooks/creem
```

Register the printed URL as a webhook endpoint on the Developers tab of the Creem dashboard.

## How It Works

- `src/index.js`: `verifyCreemSignature()` plus the `POST /webhooks/creem` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so the signature covers the exact
   bytes received whatever the content type.
2. The `creem-signature` header must be exactly 64 hex characters; the handler computes the
   HMAC-SHA256 of the body with the signing secret and compares in constant time (`401` on failure).
3. The body must be a JSON object (`400` otherwise).
4. The handler dispatches on `eventType` (`checkout.completed`, the `subscription.*` events,
   `refund.created`, `dispute.created` and the credit events), logs anything else, and returns
   `200 {"received": true}`.
