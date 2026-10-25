# Tremendous Webhooks - Express Example

Minimal example of receiving Tremendous webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Tremendous account with a webhook created via the API (it returns the `private_key`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Tremendous webhook `private_key` to `.env` as `TREMENDOUS_WEBHOOK_PRIVATE_KEY`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 tremendous --path /webhooks/tremendous
```

Then register the Hookdeck URL as the webhook `url` (`POST /webhooks`) and fire a sample event with `POST /webhooks/{id}/simulate` (for example `{"event": "INVOICES.PAID"}`).

## Endpoint

- `POST /webhooks/tremendous` - Receives and verifies Tremendous webhook events (`Tremendous-Webhook-Signature`). The raw body is read with `express.raw({ type: '*/*' })` so any content type verifies.
