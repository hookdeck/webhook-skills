# Klarna Webhooks - Express Example

Minimal Express example of receiving [Klarna](https://www.klarna.com) Notifications API webhooks and verifying the `Klarna-Signature` HMAC.

## Prerequisites

- Node.js 18+
- Klarna Notifications API credentials and a signing key (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `KLARNA_SIGNING_KEY` in `.env` to the `signing_key` that createSigningKey returned, as-is.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/klarna` in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests cover a valid signature, a base64 digest (rejected), a second event type, another key, a tampered body, a missing header, a trailing newline in the key, invalid JSON, and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 klarna --path /webhooks/klarna
```

Create a Klarna webhook with the printed URL (port 443), then simulate an event in the test environment.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The HMAC covers the exact raw body, so don't put `express.json()` in front of it.
- One signing key is configured. During a key rotation, pick the key named by `Klarna-Signing-Key-Id` (see [verification](../../references/verification.md)).
