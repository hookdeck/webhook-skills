# SavvyCal Webhooks - Next.js Example

Minimal example of receiving SavvyCal webhooks with signature verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A SavvyCal webhook with its secret (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your SavvyCal webhook secret to `.env.local` as `SAVVYCAL_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Receive live webhooks locally

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 savvycal --path /webhooks/savvycal
```

Point your SavvyCal webhook at the tunnel URL, then book, reschedule, or cancel a
meeting to trigger `event.created`, `event.rescheduled`, and `event.canceled`.

## How It Works

- `app/webhooks/savvycal/route.ts` reads the **raw** body with `request.text()`.
- `lib/savvycal.ts` holds the verification helper: HMAC-SHA256 (hex) of the raw body with the webhook secret.
- The `x-savvycal-signature` header may carry an optional `sha256=` prefix and any hex case; both are handled, and the comparison is timing-safe.

## Endpoint

- `POST /webhooks/savvycal` - Receives and verifies SavvyCal webhook events
