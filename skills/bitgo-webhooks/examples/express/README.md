# BitGo Webhooks - Express Example

Minimal Express example of receiving [BitGo](https://www.bitgo.com) webhooks and verifying the `X-Signature-SHA256` HMAC.

## Prerequisites

- Node.js 18+
- A BitGo account (the test environment is free) and a webhook secret from `POST /api/v2/webhook/secret` (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `BITGO_WEBHOOK_SECRET` in `.env` to the secret returned by `POST /api/v2/webhook/secret`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/bitgo` in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests cover a valid signature, a base64 digest (rejected), a second webhook type, another secret, a tampered body, a missing header, a trailing newline in the secret, invalid JSON, and a missing secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 bitgo --path /webhooks/bitgo
```

Add a wallet webhook with the printed URL, then call its `simulate` endpoint with `{"usePlaceholderData": true}`. Cross-check the first delivery with `POST /api/v2/webhook/{webhookId}/verify`.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The HMAC covers the exact raw body, so don't put `express.json()` in front of it.
- The hex HMAC-SHA256 check is inferred. Confirm it once against BitGo's `POST /api/v2/webhook/{webhookId}/verify` endpoint.
