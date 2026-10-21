# Pusher Channels Webhooks - Next.js Example

Minimal example of receiving Pusher Channels webhooks in a Next.js App Router route handler, verified with the official `pusher` Node SDK.

## Prerequisites

- Node.js 18+
- A Pusher Channels app (app id, key, secret, cluster)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Pusher app credentials to `.env` (`PUSHER_APP_SECRET` signs the webhooks)

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts `POST /webhooks/pusher`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 pusher --path /webhooks/pusher
```

Paste the Hookdeck URL into your app's webhook settings in the Pusher dashboard, then subscribe to a channel to trigger `channel_occupied`.

## Test

```bash
npm test
```

Tests build real `X-Pusher-Signature` values (hex HMAC-SHA256 of the raw body) and cover valid, tampered, missing-header, unknown-key and batched requests.

## Notes

- The route reads `request.text()` so the signed bytes are untouched.
- `pusher.webhook(...).isValid()` needs a `Content-Type` of exactly `application/json`.
- Bad signatures return 400; Pusher retries non-2xx responses for 5 minutes.
