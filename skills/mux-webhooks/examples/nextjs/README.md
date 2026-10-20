# Mux Webhooks - Next.js Example

Minimal example of receiving Mux webhooks in a Next.js App Router route handler with signature verification, using the official [`@mux/ts`](https://www.npmjs.com/package/@mux/ts) SDK's `webhooks.unwrap()`.

## Prerequisites

- Node.js 20+
- Mux account with a webhook signing secret (Dashboard → Settings → Webhooks)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Mux webhook signing secret to `.env` as `MUX_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

The webhook route is served at http://localhost:3000/webhooks/mux

## Test

```bash
npm test
```

The tests call the route's `POST` handler with real Mux signatures (HMAC-SHA256 of `"<timestamp>.<raw body>"`, hex-encoded) and assert it accepts valid requests and rejects missing, invalid, tampered, and expired ones.

## Receive real webhooks locally

Use the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 mux --path /webhooks/mux
```

Add the printed HTTPS URL as a webhook in the Mux Dashboard, use that webhook's signing secret as `MUX_WEBHOOK_SECRET`, then create an asset to trigger events.

## How verification works

The route reads the **raw** body with `await request.text()` (App Router route handlers don't pre-parse the body) and passes it with the request headers to `mux.webhooks.unwrap()`. The SDK checks the `mux-signature` header against `HMAC-SHA256(secret, "<t>.<raw body>")` with a constant-time compare, rejects timestamps older than 5 minutes, and returns the typed event. The route then dispatches on `event.type`.
