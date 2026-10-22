# Shopware Webhooks - Express Example

Minimal example of receiving Shopware app webhooks with signature verification (`shopware-shop-signature`, HMAC-SHA256 hex over the raw body, keyed with the per-shop app secret).

## Prerequisites

- Node.js 18+
- A Shopware app registered on a shop, with the app secret stored for that shop

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the app secret for each shop to `SHOPWARE_APP_SECRETS` in `.env` (keyed by shop ID). For a single shop, `SHOPWARE_APP_SECRET` works as a fallback.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 shopware --path /webhooks/shopware
```

Then use the Hookdeck URL in your app manifest's `<webhook url="...">`.

### Trigger Test Events

- Place an order or edit a product on the shop
- Run the automated tests with `npm test`

## Endpoint

- `POST /webhooks/shopware` - Receives and verifies Shopware webhook events. The body is read with `express.raw({ type: '*/*' })` so any content type verifies.
