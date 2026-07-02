# GoCardless Webhooks - Next.js Example

Minimal example of receiving GoCardless webhooks in a Next.js App Router route with
signature verification using the official
[`gocardless-nodejs`](https://www.npmjs.com/package/gocardless-nodejs) SDK.

## Prerequisites

- Node.js 18+
- A GoCardless account with a webhook endpoint secret (see
  [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Add your GoCardless webhook endpoint secret to `.env`:

   ```bash
   GOCARDLESS_WEBHOOK_SECRET=your_webhook_endpoint_secret
   ```

## Run

```bash
npm run dev
```

The webhook route is available at `POST http://localhost:3000/webhooks/gocardless`.

## How It Works

- The route reads the **raw body** with `await request.text()` — GoCardless signs the
  exact bytes, so never parse JSON before verifying. `export const dynamic = 'force-dynamic'`
  keeps the route from being cached.
- `parse(rawBody, secret, signature)` from `gocardless-nodejs/webhooks` verifies the
  `Webhook-Signature` (HMAC-SHA256, timing-safe) and returns the `events` array,
  throwing `InvalidSignatureError` on mismatch.
- A webhook is a **batch** of up to 250 events, each dispatched by `resource_type` +
  `action`. Return `204 No Content` to acknowledge; keep handlers **idempotent on
  `event.id`** because GoCardless retries the whole batch on any non-2xx.

## Test

Run the included tests (they generate real signatures with the same HMAC-SHA256
algorithm GoCardless uses):

```bash
npm test
```

## Receive Real Webhooks Locally

Use the Hookdeck CLI to tunnel live GoCardless webhooks to your local server — no
install and no account required:

```bash
npx hookdeck-cli listen 3000 gocardless --path /webhooks/gocardless
```

Set your GoCardless webhook endpoint URL to the tunnel URL the CLI prints, then create
a test payment/mandate in the Sandbox Dashboard to trigger events.
