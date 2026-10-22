# Check Webhooks - Next.js Example

Minimal example of receiving [Check](https://www.checkhq.com) payroll webhooks with `Check-Signature` verification, using the App Router.

## Prerequisites

- Node.js 18+
- A Check account and a Webhook Config (its `key` is the signing secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Webhook Config `key` to `.env` as `CHECK_WEBHOOK_KEY`. Use it as plain text; do not hex-decode it.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Using Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 check-hq --path /webhooks/check-hq
```

Create a Webhook Config pointing at the Hookdeck URL, then send a test event:

```bash
curl --request POST \
  --url https://sandbox.checkhq.com/webhook_configs/YOUR_WEBHOOK_CONFIG_ID/ping \
  --header 'Authorization: Bearer YOUR_API_KEY'
```

## Endpoint

- `POST /webhooks/check-hq` - Verifies `Check-Signature` over the raw body (`request.text()`) and handles Check events. Verification lives in `lib/check.ts`.
