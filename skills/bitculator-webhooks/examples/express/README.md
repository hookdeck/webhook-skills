# Bitculator Webhooks - Express Example

Minimal example of receiving Bitculator webhooks with `X-Bitculator-Signature` verification.

## Prerequisites

- Node.js 18+
- Bitculator API key with the `data-api` ability, and a webhook endpoint registered with `POST /api/v1/webhooks` (its signing secret is returned once)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the signing secret to `.env` (`BITCULATOR_WEBHOOK_SECRET`). Use the whole string as returned, `whsec_` prefix included; do not base64-decode it.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

The handler reads the raw body with `express.raw({ type: '*/*' })` and checks `v1` = HMAC-SHA256 (hex) of `<t>.<raw body>`. Failures return 401. The timestamp window is off by default (`BITCULATOR_WEBHOOK_TOLERANCE_SECONDS` unset or `0`); set `300` to match Bitculator's own example when Bitculator calls you directly. Behind Hookdeck leave it off: retries and replays resend the original timestamp.

After verifying, the handler routes on the `X-Bitculator-Event` header (not signed, so it is read only after the signature check; `alarm.triggered` when absent) and acknowledges and skips unknown events. The body follows the `alarmTriggered` callback in Bitculator's OpenAPI spec (`event`, `created_at`, `data.alarm`). The handler still checks each field's type, acknowledges and logs a non-JSON body, and treats `data.test: true` as a test delivery.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 bitculator --path /webhooks/bitculator
```

Register the Hookdeck URL as the endpoint `url`, then fire a signed test event:

```bash
curl -X POST https://bitculator.com/api/v1/webhooks/$WEBHOOK_ID/test \
  -H "Authorization: Bearer $BITCULATOR_API_KEY"
```
