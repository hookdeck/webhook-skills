# Onramper Webhooks - Express Example

Minimal example of receiving Onramper transaction status webhooks with signature verification.

## Prerequisites

- Node.js 18+
- An Onramper ApiKey with webhooks enabled by your Customer Success Manager (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the secret key Onramper issued to `.env` as `ONRAMPER_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts `POST /webhooks/onramper`.

## Test

```bash
npm test
```

The tests sign payloads based on Onramper's documented sample with HMAC-SHA256 and cover valid, tampered, malformed and missing signatures plus all six statuses. No Onramper account is needed.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 onramper --path /webhooks/onramper
```

Give the printed URL to your Onramper Customer Success Manager.

## How It Works

- `src/index.js`: `verifyOnramperSignature()` and the `/webhooks/onramper` route, which reads the body with `express.raw({ type: '*/*' })` so any content type works.

1. The raw body bytes are hashed with HMAC-SHA256 keyed with `ONRAMPER_WEBHOOK_SECRET` and compared to `X-Onramper-Webhook-Signature` (64 hex characters, case-insensitive) in constant time. Failure returns `401`.
2. Only then is the body parsed as JSON (`400` if invalid).
3. The handler dispatches on `status` (`completed`, `paid`, `pending`, `new`, `failed`, `canceled`); `transactionType` is `buy` or `offramp`.
4. It returns `200 {"received": true}`.
