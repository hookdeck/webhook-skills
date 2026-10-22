# Exa Webhooks - Next.js Example

Minimal example of receiving Exa Websets webhooks with `Exa-Signature` verification.

## Prerequisites

- Node.js 18+
- Exa account with an API key; the webhook `secret` is returned when you create the webhook

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Exa webhook secret to `.env` (`EXA_WEBHOOK_SECRET`)

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 (the webhook route is `/webhooks/exa`)

The handler verifies `Exa-Signature` (`t=<unix>,v1=<hex>`, HMAC-SHA256 of `<t>.<raw body>`). The timestamp check is off by default because retries and replays keep the original timestamp; set `EXA_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 exa --path /webhooks/exa
```

Use the Hookdeck URL as the `url` when you create the webhook (`POST https://api.exa.ai/websets/v0/webhooks`), and copy the returned `secret` into `.env`. See [../../references/setup.md](../../references/setup.md).
