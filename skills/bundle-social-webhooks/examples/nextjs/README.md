# bundle.social Webhooks - Next.js Example

Minimal example of receiving bundle.social webhooks with signature verification
using the Next.js App Router and the official
[`bundlesocial`](https://www.npmjs.com/package/bundlesocial) SDK.

## Prerequisites

- Node.js 18+
- A bundle.social webhook and its signing secret
  ([Webhooks dashboard](https://bundle.social/dashboard/organization/webhooks))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your signing secret to `.env.local` as `BUNDLE_SOCIAL_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

Run the test suite (it signs payloads with real HMAC-SHA256 signatures):

```bash
npm test
```

### Receive real webhooks locally

bundle.social only delivers to HTTPS URLs. Forward deliveries to your local server
with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 bundle-social --path /webhooks/bundle-social
```

Add the HTTPS URL Hookdeck prints as a webhook in the bundle.social dashboard,
then publish a post (or resend an event from the dashboard).

## How It Works

- `request.text()` reads the **raw body**; the signature covers the exact bytes sent.
- `bundle.webhooks.constructEvent(rawBody, signature, secret)` checks the
  `x-signature` header (hex HMAC-SHA256 of the body) and returns the parsed
  `{ type, data }` event, or throws `Invalid signature`.
- Returns `400` on a missing/invalid signature and `200` once verified, including
  for event types the handler doesn't know.
- The route runs on the Node.js runtime (`export const runtime = 'nodejs'`).

## Endpoint

- `POST /webhooks/bundle-social` - Receives and verifies bundle.social webhooks
