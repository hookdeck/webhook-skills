# iDenfy Webhooks - Express Example

Minimal example of receiving iDenfy webhooks and verifying the `Idenfy-Signature` header
(HMAC-SHA256 of the raw body, lowercase hex).

## Prerequisites

- Node.js 18+
- An iDenfy account with a webhook that has a signing key (Settings → System notifications →
  the webhook → Headers → Signing key; see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `IDENFY_WEBHOOK_SECRET` to the signing key you set on the webhook.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/idenfy`.

## Test

```bash
npm test
```

The tests sign payloads with the same algorithm iDenfy uses and cover valid, tampered,
wrong-secret, malformed and missing signatures, any content type, and the handled events.
No iDenfy account is needed.

## Receive iDenfy Webhooks Locally

```bash
npx hookdeck-cli listen 3000 idenfy --path /webhooks/idenfy
```

Put the printed URL in the webhook's URL field in **Settings → System notifications**.

## How It Works

- `src/index.js`: `verifyIdenfySignature()` plus the `POST /webhooks/idenfy` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so the signature covers the exact
   bytes received whatever the content type.
2. The `Idenfy-Signature` header must be exactly 64 hex characters; the handler computes the
   HMAC-SHA256 of the body with the signing key and compares in constant time (`401` on failure).
3. The body must be a JSON object (`400` otherwise).
4. The handler dispatches on the `Idenfy-Event-Type` header (`IDENTIFICATION_AUTO_FINISHED`,
   `IDENTIFICATION_MANUAL_FINISHED`, `IDENTIFICATION_EXPIRED`, `IDENTIFICATION_CANCELLED`,
   `COMPANY_REVIEW`, `AML_MONITORING`) and returns `200 {"received": true}`.
