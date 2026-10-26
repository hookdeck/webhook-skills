# Checkout Page Webhooks - Express Example

Minimal example of receiving Checkout Page webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Checkout Page account with a webhook signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Checkout Page signing secret to `.env` (Settings > Webhooks > View signing secret)

## Run

```bash
npm start
```

Server runs on http://localhost:3000. The webhook endpoint is `POST /webhooks/checkout-page`.

## Test

```bash
npm test
```

To receive real webhooks locally (no account required):

```bash
npx hookdeck-cli listen 3000 checkout-page --path /webhooks/checkout-page
```

Use the tunnel URL as the endpoint in Store settings > Integrations > Webhooks.
