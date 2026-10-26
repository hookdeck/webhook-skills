# OpnForm Webhooks - Express Example

Minimal example of receiving OpnForm form submission webhooks with signature verification.

## Prerequisites

- Node.js 18+
- An OpnForm form with a webhook integration and a webhook secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set a webhook secret on the OpnForm webhook integration (12+ characters). Without one, deliveries are unsigned and fail verification. Put the same value in `.env` as `OPNFORM_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

The handler reads the raw body with `express.raw({ type: '*/*' })` and verifies `X-Webhook-Signature` (`sha256=<hex>`): lowercase hex HMAC-SHA256 of the raw body, keyed with the secret. The prefix is optional. A missing or invalid signature gets a 401. Only after that is the body parsed.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 opnform --path /webhooks/opnform
```

Use the Hookdeck URL as the webhook integration's URL in OpnForm, then submit the form.
