# WooCommerce Webhooks - Next.js Example

Minimal example of receiving WooCommerce webhooks with signature verification using Next.js App Router.

## Prerequisites

- Node.js 18+
- WooCommerce store with webhook signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your WooCommerce webhook secret to `.env.local`:
   ```
   WOOCOMMERCE_WEBHOOK_SECRET=your_webhook_secret_from_woocommerce
   ```

## Run

Development mode:
```bash
npm run dev
```

Production build:
```bash
npm run build
npm start
```

Server runs on http://localhost:3000

## Test

You can test with a sample payload:

```bash
curl -X POST http://localhost:3000/webhooks/woocommerce \
  -H "Content-Type: application/json" \
  -H "X-WC-Webhook-Topic: order.created" \
  -H "X-WC-Webhook-Signature: your_generated_signature" \
  -d '{"id": 123, "status": "processing", "total": "29.99"}'
```

## WooCommerce Setup

In your WooCommerce admin:
1. Go to **WooCommerce > Settings > Advanced > Webhooks**
2. Add webhook with delivery URL: `http://localhost:3000/webhooks/woocommerce`
3. Copy the webhook secret to your `.env.local` file