# LearnHouse Webhooks - Next.js Example

Minimal example of receiving LearnHouse webhooks with `X-Webhook-Signature` verification, using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A LearnHouse organization with webhooks enabled (Pro) and the endpoint secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your LearnHouse endpoint secret to `.env`. Paste the whole secret, including the whsec_ prefix. LearnHouse uses it as a plain HMAC key.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts `POST /webhooks/learnhouse`.

## Test

```bash
npm test
```

Tests generate real `sha256=<hex>` signatures (HMAC-SHA256 of the raw body).

## Receive real webhooks locally

LearnHouse rejects `localhost` targets, so expose your server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 learnhouse --path /webhooks/learnhouse
```

Use the tunnel URL as the endpoint URL in LearnHouse, then send a `ping` with `POST /api/v1/orgs/{org_id}/webhooks/{webhook_uuid}/test`.

## How verification works

The route handler reads the body with `await request.arrayBuffer()` and verifies the signature (in `lib/learnhouse.ts`) before parsing JSON. The signature must be 64 hex characters (with or without `sha256=`); it is compared with `crypto.timingSafeEqual` against HMAC-SHA256 of the raw bytes keyed with the whole secret as UTF-8. A bad signature gets `401`.
