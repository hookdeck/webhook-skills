# Prive Webhooks - Express Example

Minimal example of receiving Prive (now Recurly Commerce) webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Prive merchant account and the secret token Prive provides (ask Prive support if you don't have it)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Prive secret token to `.env` as `PRIVE_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

Endpoints:

- `POST /webhooks/prive` - verifies the signature; topic not identified
- `POST /webhooks/prive/:topic` - one path per topic, e.g. `/webhooks/prive/billing-attempts-failed`

Prive documents no topic header or body field, so create one Prive webhook per topic and point each at its own path. Slugs: `subscriptions-created`, `subscriptions-line-removed`, `subscriptions-status-updated`, `orders-created`, `billing-attempts-created`, `billing-attempts-success`, `billing-attempts-failed`, `payment-method-updated`, `subscription-activities-created`, `subscription-custom-attributes-updated`.

## Test

```bash
npm test
```

The tests sign payloads with Prive's algorithm (base64 HMAC-SHA256 of the raw body).

### Receive live webhooks locally

```bash
npx hookdeck-cli listen 3000 prive --path /webhooks/prive
```

## Verification note

The route uses `express.raw({ type: '*/*' })` so the exact raw bytes are hashed whatever the content type. The `x-prive-hmac-sha256` header is compared as a base64 string in constant time after a length check.
