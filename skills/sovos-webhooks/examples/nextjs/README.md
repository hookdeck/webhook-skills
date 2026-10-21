# Sovos Webhooks - Next.js Example

Minimal Next.js App Router example of receiving Sovos e-invoicing (Indirect Tax
API) webhooks with signature verification. Sovos delivers through Svix, so
verification uses the official [`svix`](https://www.npmjs.com/package/svix) SDK.

## Prerequisites

- Node.js 22+ (the `svix` 2.x package requires it)
- A Sovos webhook endpoint configured in the Svix Consumer App Portal, with its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your signing secret to `.env.local` as `SOVOS_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The route handler is
`app/webhooks/sovos/route.ts`, served at `POST http://localhost:3000/webhooks/sovos`.

## Test

```bash
npm test
```

The tests call the route handler directly with Svix-signed payloads and cover
valid events, secret rotation, invalid signatures, tampered bodies, stale
timestamps, and a missing secret.

## Local Testing with Hookdeck

Expose your local server (no account required):

```bash
npx hookdeck-cli listen 3000 sovos --path /webhooks/sovos
```

Add the printed URL as an endpoint in the Svix Consumer App Portal, then send an
example event from the portal's **Testing** tab.
