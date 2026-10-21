# Modern Treasury Webhooks - Express Example

Minimal example of receiving Modern Treasury webhooks with `X-Signature` (HMAC-SHA256) verification.

## Prerequisites

- Node.js 18+
- Modern Treasury account with a webhook endpoint and its webhook key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Modern Treasury webhook key (Developers > Webhooks) to `.env` as `MODERN_TREASURY_WEBHOOK_KEY`

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

To receive real webhooks locally, run the Hookdeck CLI and use the URL it prints as the endpoint URL in Modern Treasury:

```bash
npx hookdeck-cli listen 3000 modern-treasury --path /webhooks/modern-treasury
```

## Endpoint

- `POST /webhooks/modern-treasury` - Verifies `X-Signature`, dispatches on `X-Topic` + body `event`, and de-duplicates on `X-Webhook-ID`
