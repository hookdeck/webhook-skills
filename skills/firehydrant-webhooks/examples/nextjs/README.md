# FireHydrant Webhooks - Next.js Example

Minimal example of receiving FireHydrant webhooks with signature verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- FireHydrant account (Owner permissions) with a webhook Secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your FireHydrant webhook Secret to `.env.local`

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
npx hookdeck-cli listen 3000 firehydrant --path /webhooks/firehydrant
```

Use the Hookdeck URL as the webhook **URL** in FireHydrant (Settings → Webhooks), then update an incident or create a change event.

## Endpoint

- `POST /webhooks/firehydrant` - Verifies the `fh-signature` header (hex HMAC-SHA256 of the raw body, read with `request.text()`) and handles `incident`, `change_event` and `signals_alerts` payloads. The verifier lives in `lib/verify.ts`.
