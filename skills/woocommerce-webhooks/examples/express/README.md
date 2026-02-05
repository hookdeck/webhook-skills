# WooCommerce Webhooks - Express Example

Minimal example of receiving WooCommerce webhooks with signature verification.

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
   cp .env.example .env
   ```

3. Add your WooCommerce webhook secret to `.env`:
   ```
   WOOCOMMERCE_WEBHOOK_SECRET=your_webhook_secret_from_woocommerce
   ```

## Run

```bash
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

The signature should be generated using HMAC SHA-256 with your webhook secret.

## WooCommerce Setup

In your WooCommerce admin:
1. Go to **WooCommerce > Settings > Advanced > Webhooks**
2. Add webhook with delivery URL: `http://localhost:3000/webhooks/woocommerce`
3. Copy the webhook secret to your `.env` file