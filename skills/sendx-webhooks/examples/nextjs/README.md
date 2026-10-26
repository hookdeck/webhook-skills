# SendX Webhooks - Next.js Example

Minimal example of receiving SendX webhooks with signature verification (App Router).

## Prerequisites

- Node.js 18+
- A SendX account and your team API key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```
3. Add your SendX team API key (Settings → Team API Key) to `.env.local` as `SENDX_WEBHOOK_SECRET`.
   SendX signs webhooks with it.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 sendx --path /webhooks/sendx
```

Then set the Hookdeck URL as the webhook URL in SendX. The route reads the raw bytes with
`await request.arrayBuffer()` before verifying.
