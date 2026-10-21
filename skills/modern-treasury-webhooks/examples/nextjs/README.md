# Modern Treasury Webhooks - Next.js Example

Minimal example of receiving Modern Treasury webhooks with `X-Signature` (HMAC-SHA256) verification using the Next.js App Router.

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
   cp .env.example .env.local
   ```

3. Add your Modern Treasury webhook key (Developers > Webhooks) to `.env.local` as `MODERN_TREASURY_WEBHOOK_KEY`

## Run

```bash
npm run dev
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

Verification and event handling live in `lib/modern-treasury.ts`; the route reads the raw body with `request.text()`.
