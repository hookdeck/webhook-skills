# Juniper Mist Webhooks - Express Example

Minimal Express example of receiving [Juniper Mist](https://www.mist.com) webhooks and verifying the `X-Mist-Signature-v2` HMAC.

## Prerequisites

- Node.js 18+
- A Mist organization and an HTTP Post webhook with a Secret (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `MIST_WEBHOOK_SECRET` in `.env` to the Secret on the Mist webhook.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/juniper-mist` in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests cover a valid v2 signature, a base64 digest (rejected), uppercase hex, the v1 SHA-1 value in place of v2 (rejected), a batch of two events, another secret, a tampered body, a missing header, a request with only the v1 header (rejected), v2 alongside v1, a trailing newline in the secret, invalid JSON, and a missing secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 juniper-mist --path /webhooks/juniper-mist
```

Add an HTTP Post webhook with the printed URL and a Secret, then send a test with `POST /api/v1/orgs/{org_id}/webhooks/{webhook_id}/ping`.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The HMAC covers the exact raw body, so don't put `express.json()` in front of it.
- Only `X-Mist-Signature-v2` is checked. The legacy SHA-1 `X-Mist-Signature` is ignored.
- One delivery can carry several events in `events`.
