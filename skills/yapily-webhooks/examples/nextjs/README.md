# Yapily Webhooks - Next.js Example

Minimal example of receiving Yapily webhooks with signature verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- Yapily application with the Webhooks product enabled (Private Beta) and the webhook secret from registration

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the `webhookSecret` returned by `POST /webhook/events` to `.env` as `YAPILY_WEBHOOK_SECRET`

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
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 yapily --path /webhooks/yapily
```

Then register the Hookdeck URL as the `callbackUrl.main.url` of your Yapily webhook (no query parameters allowed).

## Endpoint

- `POST /webhooks/yapily` - Receives and verifies Yapily webhook events. The route reads the raw body with `request.text()` and verifies `webhook-signature` (or `webhook-rotation-signature` during a secret rotation). The verification helper lives in `lib/verify.ts`.
