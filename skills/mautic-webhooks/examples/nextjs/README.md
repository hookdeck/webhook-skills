# Mautic Webhooks - Next.js Example

Minimal example of receiving Mautic webhooks with `Webhook-Signature` verification, using the App Router.

## Prerequisites

- Node.js 18+
- Mautic instance with a webhook and its secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Mautic webhook secret to `.env.local`

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
npx hookdeck-cli listen 3000 mautic --path /webhooks/mautic
```

Use the Hookdeck URL as the Webhook POST URL in Mautic (Webhooks → your webhook), then click **Send Test Payload**.

## Endpoint

- `POST /webhooks/mautic` - Receives and verifies Mautic webhook events (`app/webhooks/mautic/route.ts`; verification lives in `lib/verify.ts`)
