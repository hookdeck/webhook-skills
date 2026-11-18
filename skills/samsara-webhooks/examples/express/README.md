# Samsara Webhooks - Express Example

Minimal Express example of receiving [Samsara](https://developers.samsara.com/docs/webhooks) webhooks and verifying the `X-Samsara-Signature: v1=<hex>` header (HMAC-SHA256 of `v1:<X-Samsara-Timestamp>:<raw body>`, keyed with the base64-decoded secret key).

## Prerequisites

- Node.js 18+
- A Samsara organization where you can add webhooks (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `SAMSARA_WEBHOOK_SECRET` to the secret key listed with the webhook under Settings > Webhooks, exactly as shown (base64).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/samsara` in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests sign requests the way Samsara does. They check a vector built from Samsara's sample secret, the `Ping` and `Alert` dispatch, a signature keyed with the secret as UTF-8 text instead of its decoded bytes, another secret, a tampered body, a missing header, a missing `v1=` prefix or another version, a changed or missing timestamp, a secret with a trailing newline, invalid JSON, and the `500` paths for a missing or malformed secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 samsara --path /webhooks/samsara
```

Use the printed HTTPS URL as the webhook URL in Samsara, then click **Test** on the webhook to send a `Ping`.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The HMAC covers the exact raw body, so `express.json()` on this route breaks it.
- The secret key is base64. The handler decodes it before using it as the HMAC key; the key string itself never matches.
- Samsara documents no timestamp tolerance, so the handler doesn't apply one. The timestamp is still covered by the signature.
- Samsara retries non-2xx responses (5 attempts in total, with exponential backoff) and doesn't follow redirects. Return `2xx` quickly and skip duplicates by `eventId`.
