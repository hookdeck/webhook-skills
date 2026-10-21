# Buildkite Webhooks - Express Example

Minimal example of receiving Buildkite webhooks with token or signature verification.

## Prerequisites

- Node.js 18+
- Buildkite organization with access to Notification Services and a webhook token

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Buildkite webhook token to `.env` (`BUILDKITE_WEBHOOK_TOKEN`)

## Run

```bash
npm start
```

Server runs on http://localhost:3000

The handler accepts either `X-Buildkite-Token` (default token mode) or `X-Buildkite-Signature` (HMAC-SHA256 of `<timestamp>.<raw body>`; the timestamp check is off by default because retries and replays keep the original timestamp; set `BUILDKITE_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones).

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 buildkite --path /webhooks/buildkite
```

Use the Hookdeck URL as the webhook URL in Buildkite → Settings → Notification Services → Webhook. Saving the webhook sends a `ping` event.
