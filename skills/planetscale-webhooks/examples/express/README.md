# PlanetScale Webhooks - Express Example

Minimal example of receiving PlanetScale webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A PlanetScale database with a webhook configured (Settings → Webhooks) and its secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your PlanetScale webhook secret to `.env` as `PLANETSCALE_WEBHOOK_SECRET` (… → Show secret on the Webhooks page). Each webhook has its own secret.

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
npx hookdeck-cli listen 3000 planetscale --path /webhooks/planetscale
```

Then use the Hookdeck URL as the webhook URL in PlanetScale (database Settings → Webhooks → Add webhook). If you put Hookdeck in front, paste the webhook secret into the Hookdeck source.

### Trigger Test Events

On the Webhooks page, click **…** → **Test webhook** to send a `webhook.test` delivery (one test every 20 seconds).

## Endpoint

- `POST /webhooks/planetscale` - Receives and verifies PlanetScale webhook events (`X-PlanetScale-Signature`, hex HMAC-SHA256 of the raw body). Uses `express.raw({ type: '*/*' })` so the signature is checked against the exact bytes for any content type; the body is parsed only after verification.
