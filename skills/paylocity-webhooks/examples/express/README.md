# Paylocity Webhooks - Express Example

Minimal Express example of receiving [Paylocity](https://developer.paylocity.com/integrations/reference/webhooks-authentication) webhooks and verifying the `x-pcty-signature: keyId=<uuid>:signature=<hex>` header (HMAC-SHA256 of `<x-pcty-timestamp>.<raw body>`, keyed with the base64-decoded HMAC secret), including the two-pair header sent during key rotation.

## Prerequisites

- Node.js 18+
- Approved access to Paylocity's Webhooks API (Early Access) and sandbox API credentials (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PAYLOCITY_HMAC_SECRET` to the base64 secret returned when the subscription's key was created (`auth.hmac.key1.secret`), exactly as returned. Optionally set `PAYLOCITY_TIMESTAMP_TOLERANCE_SECONDS=300` to reject deliveries older than Paylocity's recommended 5 minutes.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/paylocity` in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests sign requests the way Paylocity does. They check a two-key vector with either secret, a rotation header with either secret configured, a signature keyed with the secret as UTF-8 text instead of its decoded bytes, another secret, a tampered body, a missing header, a changed timestamp, a pair without `keyId`, the opt-in timestamp tolerance, a secret with a trailing newline, invalid JSON, and the `500` paths for a missing or malformed secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 paylocity --path /webhooks/paylocity
```

Use the printed HTTPS URL as the subscription's `url`, then change an employee in the sandbox company.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The HMAC covers the exact raw body, so `express.json()` on this route breaks it.
- The secret is base64. The handler decodes it before using it as the HMAC key; the base64 string itself never matches.
- During key rotation each delivery carries one `keyId=...:signature=...` pair per active key. The handler accepts the delivery if any pair matches the configured secret, so switch `PAYLOCITY_HMAC_SECRET` to the new key's secret any time before the old key expires.
- Paylocity recommends rejecting timestamps more than 300 seconds from your clock. The check is off by default; set `PAYLOCITY_TIMESTAMP_TOLERANCE_SECONDS=300` to turn it on.
- Paylocity doesn't retry `400`, `404`, `409`, `422` or `500`. Return `503` for a temporary failure you want retried.
