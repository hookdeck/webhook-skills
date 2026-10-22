# VGS Webhooks - Next.js Example

Minimal example of receiving VGS (Very Good Security) webhooks with `vgs-signature` verification.

## Prerequisites

- Node.js 18+
- VGS organization with Notifications enabled and the webhook integration's secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your VGS integration secret to `.env` (`VGS_WEBHOOK_SECRET`)

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

The handler verifies `vgs-signature` (`t=<unix seconds>,v0=<hex>`, HMAC-SHA256 of `<t>.<raw body>`). The timestamp check is off by default because VGS and Hookdeck retries keep the original timestamp; set `VGS_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 vgs --path /webhooks/vgs
```

Use the Hookdeck URL as the destination in VGS Dashboard → Organization Settings → Notifications.
