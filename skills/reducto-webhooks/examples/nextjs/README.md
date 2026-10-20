# Reducto Webhooks - Next.js Example

Minimal example of receiving Reducto async job webhooks (delivered via Svix) with
signature verification using the official `svix` SDK.

## Prerequisites

- Node.js 22+
- Reducto account with a Svix endpoint signing secret (`whsec_...`) from Reducto Studio → **Webhooks**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your signing secret to `.env` as `REDUCTO_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

Webhook endpoint: `POST http://localhost:3000/webhooks/reducto`

## Test

```bash
npm test
```

## Project Structure

```
├── app/
│   └── webhooks/
│       └── reducto/
│           └── route.ts    # Webhook handler
├── test/
│   └── webhook.test.ts     # Tests
└── vitest.config.ts        # Test configuration
```

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 3000 reducto --path /webhooks/reducto
```

Add the printed URL as an endpoint in the Svix dashboard (Reducto Studio →
**Webhooks** → **+ Add Endpoint**), then submit an async job with
`async.webhook.mode = "svix"`. When the job finishes you'll receive an
`async.update` webhook with `status` `Completed` or `Failed`.
