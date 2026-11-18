# SpotDraft Webhooks - Express Example

Minimal Express example of receiving [SpotDraft](https://developer.spotdraft.com/docs/api-playbooks/receive-real-time-contract-events-via-webhooks) webhooks and verifying the `X-SD-WEBHOOK-CONTENT-HASH` header (hex HMAC-SHA512 of the raw body, keyed with the base64-decoded `hmac_key`).

## Prerequisites

- Node.js 18+
- A SpotDraft workspace with Developer Settings permission and API client credentials (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `SPOTDRAFT_HMAC_KEY` to the `hmac_key` returned by `GET /api/v2.1/public/webhooks/hmac_key/`, exactly as returned (base64).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/spotdraft` in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests sign requests the way SpotDraft's sample does. They check a fixed vector (also in upper-case hex), a truncated hash, a signature keyed with the key as UTF-8 text instead of its decoded bytes, another key, a tampered body, a missing header, an HMAC-SHA256 hash in place of SHA-512, a key with a trailing newline, invalid JSON, and the `500` paths for a missing or malformed key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 spotdraft --path /webhooks/spotdraft
```

Register the printed HTTPS URL under Settings > Developer settings > Webhooks, then trigger a subscribed activity (for example, send a contract to a counterparty).

## Notes

- The route uses `express.raw({ type: '*/*' })`. The HMAC covers the exact raw body, so `express.json()` on this route breaks it.
- The `hmac_key` is base64. The handler decodes it before using it as the HMAC key, as SpotDraft's sample does with `base64.b64decode(hmac_key)`.
- SpotDraft's webhook guides don't publish the payload fields. The handler assumes none and fingerprints the raw body for deduplication; log the first real delivery and add your dispatch.
- SpotDraft documents no timestamp, so there's nothing to check for freshness. Return `2xx` quickly, after verifying and storing the delivery.
