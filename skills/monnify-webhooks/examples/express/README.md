# Monnify Webhooks - Express Example

Minimal Express example of receiving [Monnify](https://monnify.com) webhooks and verifying the `monnify-signature` HMAC-SHA512.

## Prerequisites

- Node.js 18+
- A Monnify merchant account (signed webhooks need the live environment) and its client secret key (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `MONNIFY_CLIENT_SECRET` in `.env` to your client secret key from the Monnify dashboard.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/monnify` in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests cover a valid HMAC-SHA512 signature, a base64 digest (rejected), plain SHA-512 of secret + body (rejected), an HMAC-SHA256 value (rejected), a second event type, another secret, a tampered body, a missing header, an unsigned sandbox-style request (rejected), a trailing newline in the secret, invalid JSON, and a missing secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 monnify --path /webhooks/monnify
```

Set the printed URL as a webhook URL in the Monnify dashboard. Sandbox deliveries carry no `monnify-signature`, so the example answers them with `401`.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The HMAC covers the exact raw body, so don't put `express.json()` in front of it.
- Monnify's sandbox sends no `monnify-signature`, so sandbox deliveries get `401`. That's expected.
