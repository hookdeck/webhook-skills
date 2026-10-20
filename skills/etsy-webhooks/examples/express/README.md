# Etsy Webhooks - Express Example

Minimal example of receiving Etsy webhooks with signature verification. Etsy follows the Standard Webhooks spec, so this example verifies with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package.

## Prerequisites

- Node.js 18+
- An Etsy app with an endpoint in the Etsy Webhook portal and its `whsec_` signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Etsy webhook signing secret to `.env` as `ETSY_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000. The webhook endpoint is `POST /webhooks/etsy`.

## Test

Run the test suite (generates real Standard Webhooks signatures):

```bash
npm test
```

To receive real Etsy webhooks locally, start a tunnel:

```bash
npx hookdeck-cli listen 3000 etsy --path /webhooks/etsy
```

Use the printed URL as your endpoint URL in the Etsy Webhook portal (Developer Portal → Manage your apps → Go to Webhook portal), then open the endpoint's **Testing** tab and send a test event.

## How It Works

1. `express.raw()` keeps the raw body; verification needs the exact bytes Etsy signed.
2. `new Webhook(secret).verify(body, headers)` checks the `webhook-signature` HMAC over `{webhook-id}.{webhook-timestamp}.{body}` and rejects timestamps more than 5 minutes off.
3. The handler switches on `event.event_type` (`order.paid`, `listing.updated`, `inventory.out_of_stock`, …). Etsy payloads are thin: call `event.resource_url` with your OAuth token to fetch the full resource.
