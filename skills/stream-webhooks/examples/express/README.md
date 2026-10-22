# Stream Webhooks - Express Example

Minimal example of receiving Stream (getstream.io) webhooks with `X-Signature` verification.

## Prerequisites

- Node.js 18+
- A Stream app with its API secret
- Payload Compression (`enable_hook_payload_compression`) turned **off** if you route through Hookdeck

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Stream app API secret to `.env` as `STREAM_API_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 stream --path /webhooks/stream
```

Then set the Hookdeck URL as `webhook_url` in your Stream app's `event_hooks` (or in the Dashboard) and send a message in a channel to trigger `message.new`.

## Endpoint

- `POST /webhooks/stream` - Receives and verifies Stream webhook events. The route uses `express.raw({ type: '*/*' })` so the raw body is available whatever the Content-Type.
