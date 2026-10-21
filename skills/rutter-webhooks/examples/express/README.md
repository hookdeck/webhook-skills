# Rutter Webhooks - Express Example

Minimal example of receiving Rutter webhooks with signature verification (`X-Rutter-Signature` / `X-Rutter-Signatures`, HMAC-SHA256, base64).

## Prerequisites

- Node.js 18+
- Rutter account with your client secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Rutter client secret to `.env` as `RUTTER_CLIENT_SECRET`. During a secret rotation, also set `RUTTER_CLIENT_SECRET_PREVIOUS` to the expiring secret.

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

### Receiving webhooks locally with Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 rutter --path /webhooks/rutter
```

Then paste the Hookdeck URL as the webhook URL on the Platforms page of the Rutter dashboard.

## Endpoint

- `POST /webhooks/rutter` - Receives and verifies Rutter webhook events (handles `INITIAL_UPDATE`, `CONNECTION_NEEDS_UPDATE`, `CONNECTION_DISABLED`, `ORDER_CREATED`, `ORDER_UPDATED`, `ORDER_DELETED`, `INVOICE_CREATED`, `INVOICE_UPDATED`)
- `GET /health` - Health check
