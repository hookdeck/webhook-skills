# Marqeta Webhooks - Express Example

Minimal Express example of receiving [Marqeta](https://www.marqeta.com) webhooks and verifying the required Basic auth credentials (and the optional `X-Marqeta-Signature` HMAC).

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
   cp .env.example .env
   ```

3. Set `MARQETA_WEBHOOK_USERNAME` and `MARQETA_WEBHOOK_PASSWORD` in `.env` to the webhook's Basic auth credentials. Set `MARQETA_WEBHOOK_SECRET` (and `MARQETA_SIGNATURE_ALGORITHM`) only if the webhook has a secret.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/marqeta` in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests cover Basic auth (a colon in the password, scheme case, other schemes, malformed values), HMAC-SHA256 and HMAC-SHA1 signatures, base64 and changed bodies (rejected), batched transactions, card transitions, the ping, wrong and missing credentials, signature checks when a secret is set, Basic auth still required with a valid signature, an algorithm switch, invalid JSON, and missing credentials.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 marqeta --path /webhooks/marqeta
```

Use the printed URL as the webhook's `config.url`, then call `POST /webhooks/{token}/ping`.

## Notes

- The route uses `express.raw({ type: '*/*' })`, so the optional HMAC covers the exact raw body. Don't put `express.json()` in front of it.
- Basic auth is always checked; the signature is checked only when `MARQETA_WEBHOOK_SECRET` is set.
