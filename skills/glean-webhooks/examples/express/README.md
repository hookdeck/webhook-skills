# Glean Webhooks - Express Example

Minimal example of receiving Glean trigger webhooks with Standard Webhooks signature verification.

## Prerequisites

- Node.js 18+
- A Glean trigger created with `POST /api/triggers` (its `signing_secret` is returned only once)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the trigger's `signing_secret` (`whsec_...`) to `.env` as `GLEAN_SIGNING_SECRET`. If you created the trigger with `delivery.auth` type `BEARER`, set `GLEAN_DELIVERY_BEARER` too.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 3000 glean --path /webhooks/glean
```

Use the printed HTTPS URL as the trigger's `delivery.webhook_url`.

## Notes

- The `standardwebhooks` library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones are rejected; see `references/verification.md` for a manual verifier with a configurable window.
- The raw body is read with `express.raw({ type: '*/*' })` so any content type verifies.
