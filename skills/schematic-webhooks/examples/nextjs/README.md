# Schematic Webhooks - Next.js Example

Minimal example of receiving Schematic webhooks with signature verification (App Router).

## Prerequisites

- Node.js 18+
- Schematic account with a webhook endpoint configured (gives you the webhook secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Schematic webhook secret to `.env.local` as `SCHEMATIC_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 schematic --path /webhooks/schematic
```

Then set the Hookdeck URL as the endpoint URL in Schematic's webhooks page.

## Endpoint

- `POST /webhooks/schematic` - reads the raw body with `request.arrayBuffer()`, verifies `X-Schematic-Webhook-Signature` (hex HMAC-SHA256 of `rawBody + "+" + X-Schematic-Webhook-Timestamp`), then dispatches on the body's `action`
- Verification lives in `lib/schematic.ts`
- Invalid or missing signature returns `401`
- `SCHEMATIC_WEBHOOK_TOLERANCE_SECONDS` (optional, off by default) rejects timestamps older than the window
