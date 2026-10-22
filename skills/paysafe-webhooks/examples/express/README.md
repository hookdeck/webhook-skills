# Paysafe Webhooks - Express Example

Minimal example of receiving Paysafe Payments API webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Paysafe account with a webhook configured in the Business Portal (provides the HMAC key)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Paysafe HMAC key to `.env` as `PAYSAFE_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Receive real webhooks locally with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 paysafe --path /webhooks/paysafe
```

Then use the Hookdeck URL as the webhook URL in the Paysafe Business Portal.

## Endpoint

- `POST /webhooks/paysafe` - Verifies the `Signature` header (base64 HMAC-SHA256 of the raw body) and dispatches on `eventName`
