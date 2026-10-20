# QuickBooks Webhooks - Express Example

Minimal example of receiving QuickBooks Online webhooks with `intuit-signature` verification. It handles both the CloudEvents payload and the legacy `eventNotifications` payload.

## Prerequisites

- Node.js 18+
- An Intuit Developer app with webhooks enabled and its **Verifier Token**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Verifier Token (Intuit Developer > App dashboard > your app > Webhooks > Development or Production) to `.env` as `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the test suite. It signs payloads with the same HMAC-SHA256 + base64 scheme Intuit uses:

```bash
npm test
```

To receive real webhooks locally, start a tunnel (no account needed):

```bash
npx hookdeck-cli listen 3000 quickbooks --path /webhooks/quickbooks
```

Paste the printed URL (with `/webhooks/quickbooks`) into your app's **Development** webhook Endpoint URL. Then make a change in a connected sandbox company, such as creating an invoice. The first notification can take up to five minutes.

## Endpoint

- `POST /webhooks/quickbooks` - Verifies `intuit-signature` against the raw body, then dispatches each event by action (`created`, `updated`, `deleted`, `merged`, `voided`, `emailed`)
