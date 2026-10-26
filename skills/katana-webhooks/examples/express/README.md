# Katana Webhooks - Express Example

Minimal example of receiving Katana MRP webhooks with `x-sha2-signature` verification (hex HMAC-SHA256 of the raw body).

## Prerequisites

- Node.js 18+
- A Katana webhook created through the API, and its `token`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook's `token` to `.env` as `KATANA_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000. The endpoint is `/webhooks/katana` and accepts GET, POST, PUT, PATCH and DELETE
(Katana's docs don't name the method). The body is read raw with `express.raw({ type: '*/*' })`.

To receive webhooks locally:

```bash
npx hookdeck-cli listen 3000 katana --path /webhooks/katana
```

Hookdeck's Katana MRP source pre-selects POST without managing the method, so allow any other method Katana uses.

## Test

```bash
npm test
```

The tests sign payloads with HMAC-SHA256 the same way Katana does.
