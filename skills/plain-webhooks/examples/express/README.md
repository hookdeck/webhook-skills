# Plain Webhooks - Express Example

Minimal example of receiving Plain webhooks with `Plain-Request-Signature` verification (HMAC-SHA256, hex, over the raw request body).

## Prerequisites

- Node.js 18+
- A Plain workspace with request signing turned on (Settings → Request signing; workspace admins only)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your workspace HMAC secret in `.env` as `PLAIN_WEBHOOK_SECRET`. Without a secret, Plain sends unsigned requests and verification fails.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 plain --path /webhooks/plain
```

Use the Hookdeck URL as the URL of a webhook target in Plain (Settings → Webhooks → Add webhook target).

## Test

```bash
npm test
```

The tests sign payloads with the same algorithm Plain uses, so no Plain account is needed.

## Notes

- Verification uses the raw body. The handler reads it as bytes, so any content type verifies.
- Invalid signatures return `401`; a missing header or bad JSON returns `400`.
- Plain delivers at least once. Use the top-level `id` of the body as an idempotency key.
- The replay check is off by default. Set `PLAIN_TOLERANCE_SECONDS` to reject deliveries whose `webhookMetadata.webhookDeliveryAttemptTimestamp` is too old. Leave it off behind Hookdeck, which replays original requests.
