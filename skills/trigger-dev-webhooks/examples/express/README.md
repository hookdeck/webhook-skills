# Trigger.dev Webhooks - Express Example

Minimal example of receiving Trigger.dev alert webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Trigger.dev project with a webhook alert channel (gives you the alert webhook secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your alert webhook secret to `.env` (`TRIGGER_DEV_WEBHOOK_SECRET`). It is shown on the Alerts page when you create the webhook alert.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and receives webhooks at `POST /webhooks/trigger-dev`.

The route uses `express.raw({ type: '*/*' })` so the raw body is available whatever the content type, which is what the signature is computed over.

## Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 trigger-dev --path /webhooks/trigger-dev
```

Use the URL the CLI prints as the webhook URL of your Trigger.dev alert channel.

## Test

```bash
npm test
```

Tests generate real signatures (`x-trigger-signature-hmacsha256`, hex HMAC-SHA256 of the raw body) for `alert.run.failed`, `alert.deployment.success`, `alert.deployment.failed` and `alert.error`.
