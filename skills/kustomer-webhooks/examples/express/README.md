# Kustomer Webhooks - Express Example

Minimal example of receiving Kustomer outbound webhooks with signature verification (`X-Kustomer-Webhook-Signature`, hex HMAC-SHA256 of the raw body).

## Prerequisites

- Node.js 18+
- Kustomer account with an outbound webhook and its secret (`token`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your outbound webhook's secret to `.env` as `KUSTOMER_WEBHOOK_SECRET`. In Kustomer it is under **Settings > Platform > Outbound webhooks > Edit > Header Information** (available after the first save).

## Run

```bash
npm start
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/kustomer`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 kustomer --path /webhooks/kustomer
```

Use the URL it prints as the webhook's Destination URL in Kustomer.

## Test

```bash
npm test
```

Tests sign payloads with HMAC-SHA256 using the same algorithm as Kustomer. To trigger a real event, create or update a customer or conversation in your Kustomer org.
