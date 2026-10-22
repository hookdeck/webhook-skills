# Fourthwall Webhooks - Express Example

Minimal example of receiving Fourthwall shop webhooks with signature verification (`X-Fourthwall-Hmac-SHA256`).

## Prerequisites

- Node.js 18+
- A Fourthwall shop with its webhook secret key (Settings > For developers)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Fourthwall shop secret key to `.env` as `FOURTHWALL_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the automated tests (they generate real signatures):

```bash
npm test
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 fourthwall --path /webhooks/fourthwall
```

Add the Hookdeck URL as a webhook in Fourthwall (Settings > For developers), then click **Send test notification** or place a test order.

## Endpoint

- `POST /webhooks/fourthwall` - Receives and verifies Fourthwall webhook events

The route reads the body with `express.raw({ type: '*/*' })` so the exact bytes are verified whatever the content type.
