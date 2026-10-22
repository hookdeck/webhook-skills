# Shopware Webhooks - Next.js Example

Minimal example of receiving Shopware app webhooks with signature verification (`shopware-shop-signature`, HMAC-SHA256 hex over the raw body, keyed with the per-shop app secret) using the App Router.

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
   cp .env.example .env.local
   ```

3. Add the app secret for each shop to `SHOPWARE_APP_SECRETS` (keyed by shop ID). For a single shop, `SHOPWARE_APP_SECRET` works as a fallback.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 shopware --path /webhooks/shopware
```

Then use the Hookdeck URL in your app manifest's `<webhook url="...">`.

### Automated tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/shopware` - Receives and verifies Shopware webhook events (raw body via `request.text()`, any content type)
