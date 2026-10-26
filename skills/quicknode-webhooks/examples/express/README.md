# Quicknode Webhooks - Express Example

Minimal example of receiving Quicknode Streams and Webhooks deliveries with signature verification (`X-QN-Signature`, hex HMAC-SHA256 of `X-QN-Nonce` + `X-QN-Timestamp` + raw body).

## Prerequisites

- Node.js 20+
- A Quicknode Stream (webhook destination) or Webhook, and its security token

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `QUICKNODE_WEBHOOK_SECRET` in `.env` to the security token from the Quicknode dashboard

4. Keep payload compression (gzip) off on the stream or webhook: Quicknode signs the uncompressed body.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the automated tests:

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 quicknode --path /webhooks/quicknode
```

Use the Hookdeck URL as the destination URL of your stream or webhook.

## Endpoint

- `POST /webhooks/quicknode` - Receives and verifies Quicknode deliveries (Streams batches and Webhooks matches have no event type; the handler dispatches on payload shape and the payloads shown are illustrative)
- `GET /health` - Health check

## Optional timestamp tolerance

By default old timestamps are not rejected, because Hookdeck retries and replays resend the original headers. Set `QUICKNODE_WEBHOOK_TOLERANCE_SECONDS` to opt in.
