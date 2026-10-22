# Mautic Webhooks - Express Example

Minimal example of receiving Mautic webhooks with `Webhook-Signature` verification.

## Prerequisites

- Node.js 18+
- Mautic instance with a webhook and its secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Mautic webhook secret to `.env`

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
npx hookdeck-cli listen 3000 mautic --path /webhooks/mautic
```

Use the Hookdeck URL as the Webhook POST URL in Mautic (Webhooks → your webhook), then click **Send Test Payload**.

## Endpoint

- `POST /webhooks/mautic` - Receives and verifies Mautic webhook events. Reads the raw body with `express.raw({ type: '*/*' })` so any content type verifies.
