# Marqeta Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [Marqeta](https://www.marqeta.com) webhooks and verifying the required Basic auth credentials (and the optional `X-Marqeta-Signature` HMAC).

## Prerequisites

- Node.js 18+
- Marqeta API access (the public sandbox works) and a webhook created with Basic auth credentials (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `MARQETA_WEBHOOK_USERNAME` and `MARQETA_WEBHOOK_PASSWORD` in `.env.local` to the webhook's Basic auth credentials. Set `MARQETA_WEBHOOK_SECRET` (and `MARQETA_SIGNATURE_ALGORITHM`) only if the webhook has a secret.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/marqeta` in [app/webhooks/marqeta/route.ts](app/webhooks/marqeta/route.ts); the verification code is in [lib/verify-marqeta.ts](lib/verify-marqeta.ts).

## Test

```bash
npm test
```

The tests cover Basic auth, HMAC-SHA256 and HMAC-SHA1 signatures, batched transactions, the ping, wrong and missing credentials, signature checks when a secret is set, invalid JSON, and missing credentials.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 marqeta --path /webhooks/marqeta
```

Use the printed URL as the webhook's `config.url`, then call `POST /webhooks/{token}/ping`.

## Notes

- The route reads `request.arrayBuffer()` before parsing, so the optional HMAC covers the exact raw body.
- Basic auth is always checked; the signature is checked only when `MARQETA_WEBHOOK_SECRET` is set.
