# Typefully Webhooks - Express Example

Minimal example of receiving Typefully webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Typefully account with API access and a webhook secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Typefully webhook secret to `.env` (`TYPEFULLY_WEBHOOK_SECRET`), from your Typefully API settings.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

The handler reads the raw body with `express.raw({ type: '*/*' })` and verifies `X-Typefully-Signature` (`sha256=<hex>`): HMAC-SHA256 of `<X-Typefully-Timestamp>.<raw body>`, keyed with the secret. A missing, malformed or wrong signature gets a `401`. The timestamp check is off by default because Hookdeck's retries and replays keep the original timestamp (Typefully doesn't document whether its own retries do); set `TYPEFULLY_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 typefully --path /webhooks/typefully
```

Use the Hookdeck URL as the webhook URL in Typefully.
