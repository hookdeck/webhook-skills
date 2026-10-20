# Mux Webhooks - Express Example

Minimal example of receiving Mux webhooks with signature verification, using the official [`@mux/ts`](https://www.npmjs.com/package/@mux/ts) SDK's `webhooks.unwrap()`.

## Prerequisites

- Node.js 20+
- Mux account with a webhook signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Mux webhook signing secret (Dashboard → Settings → Webhooks) to `.env` as `MUX_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Run the tests

```bash
npm test
```

The tests sign payloads with the real Mux algorithm (HMAC-SHA256 of `"<timestamp>.<raw body>"`) and cover valid, invalid, tampered, and expired requests.

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 mux --path /webhooks/mux
```

Add the public URL the CLI prints as a webhook in the Mux Dashboard (Settings → Webhooks), use that webhook's signing secret as `MUX_WEBHOOK_SECRET`, then create an asset to trigger `video.asset.created` and `video.asset.ready`.

## Endpoint

- `POST /webhooks/mux` - Receives and verifies Mux webhook events
- `GET /health` - Health check
