# Rutter Webhooks - Next.js Example

Minimal example of receiving Rutter webhooks with signature verification (`X-Rutter-Signature` / `X-Rutter-Signatures`, HMAC-SHA256, base64) using the Next.js App Router.

## Prerequisites

- Node.js 18+
- Rutter account with your client secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Rutter client secret to `.env.local` as `RUTTER_CLIENT_SECRET`. During a secret rotation, also set `RUTTER_CLIENT_SECRET_PREVIOUS` to the expiring secret.

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

### Receiving webhooks locally with Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 rutter --path /webhooks/rutter
```

Then paste the Hookdeck URL as the webhook URL on the Platforms page of the Rutter dashboard.

## Endpoint

- `POST /webhooks/rutter` - Receives and verifies Rutter webhook events (`app/webhooks/rutter/route.ts`, verification helper in `lib/rutter.ts`)
