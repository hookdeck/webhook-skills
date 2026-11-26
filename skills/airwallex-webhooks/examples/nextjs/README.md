# Airwallex Webhooks - Next.js Example

Minimal example of receiving Airwallex webhooks in a Next.js App Router route
handler with signature verification.

## Prerequisites

- Node.js 18+
- Airwallex account with a webhook endpoint secret
  (Web app → Developer → Webhooks)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Airwallex webhook secret to `.env` as `AIRWALLEX_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

The webhook route is served at http://localhost:3000/webhooks/airwallex

## Test

```bash
npm test
```

The tests call the route's `POST` handler with real Airwallex signatures
(HMAC-SHA256 over `x-timestamp + raw_body`, hex-encoded) and assert it accepts
valid requests and rejects missing, invalid, tampered, and stale ones.

## Receive real webhooks locally

Use the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 airwallex --path /webhooks/airwallex
```

Register the printed HTTPS URL as a webhook under Developer → Webhooks in the
Airwallex web app, then re-trigger a past event from Settings → Developer → Events.

## How verification works

The route reads the **raw** body with `await request.text()` (App Router route
handlers don't pre-parse the body), then verifies `x-signature` against
`HMAC-SHA256(secret, x-timestamp + raw_body)` with a constant-time compare
before parsing and dispatching on the event `name` field. See
[../../references/verification.md](../../references/verification.md).

## Endpoint

- `POST /webhooks/airwallex` - Receives and verifies Airwallex webhook events
