# Lago Webhooks - Express Example

Minimal example of receiving Lago webhooks (HMAC mode) with signature verification.

## Prerequisites

- Node.js 18+
- Lago account with a webhook endpoint created with signature algorithm **hmac** (Lago defaults to `jwt`, which this example does not handle)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your organization's HMAC Signature Token (Lago app > Developers > Webhooks) to `.env` as `LAGO_HMAC_KEY`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

## Receive Webhooks Locally

Use the Hookdeck CLI — no account required, one paste-and-run line:

```bash
npx hookdeck-cli listen 3000 lago --path /webhooks/lago
```

Paste the printed URL into Lago when adding the webhook endpoint (choose **HMAC**), then trigger an event such as creating a customer.

## Endpoint

- `POST /webhooks/lago` — Verifies `X-Lago-Signature` against the raw body (`express.raw({ type: '*/*' })`) and handles events
- `GET /health` — Health check
