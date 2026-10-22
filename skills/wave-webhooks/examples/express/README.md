# Wave Webhooks - Express Example

Minimal example of receiving Wave webhooks with `x-wave-signature` verification.

## Prerequisites

- Node.js 18+
- A Wave Pro business, a Wave app with a webhook subscription, and its webhook secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Wave webhook secret to `.env` (`WAVE_WEBHOOK_SECRET`)

## Run

```bash
npm start
```

Server runs on http://localhost:3000

The handler verifies `x-wave-signature` (`t=<unix>,v1=<hex>`, HMAC-SHA256 of `<t>.<raw body>`). It reads the body with `express.raw({ type: '*/*' })`, so any content type verifies. The 5-minute timestamp check Wave recommends is off by default because retries and replays keep the original timestamp; set `WAVE_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to opt in.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 wave --path /webhooks/wave
```

Use the Hookdeck URL as the Endpoint URL on your app's page under Webhooks in Wave.
