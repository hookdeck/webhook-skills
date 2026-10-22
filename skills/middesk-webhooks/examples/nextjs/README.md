# Middesk Webhooks - Next.js Example

Minimal example of receiving Middesk webhooks with `X-Middesk-Signature-256` signature verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Middesk account and the secret you set when creating the webhook

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your webhook secret to `.env.local` as `MIDDESK_WEBHOOK_SECRET`. Use it exactly as you set it (for example `whsec_abcdef123456`); the whole string is the HMAC key.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

Run the test suite (generates real HMAC-SHA256 signatures):

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 middesk --path /webhooks/middesk
```

Create a Middesk webhook (Settings > Webhooks, or `POST /v1/webhooks`) pointing at the Hookdeck URL, with the same `secret` you put in `.env.local`.

## Endpoint

- `POST /webhooks/middesk` - Receives and verifies Middesk webhooks (`app/webhooks/middesk/route.ts`)
