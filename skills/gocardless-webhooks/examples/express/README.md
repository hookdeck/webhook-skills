# GoCardless Webhooks - Express Example

Minimal example of receiving GoCardless webhooks with signature verification using
the official [`gocardless-nodejs`](https://www.npmjs.com/package/gocardless-nodejs) SDK.

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
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at
`POST /webhooks/gocardless`.

## How It Works

- The route uses `express.raw({ type: 'application/json' })` so the request body is
  the **raw Buffer** GoCardless signed — never parse JSON before verifying.
- `parse(req.body, secret, signatureHeader)` from `gocardless-nodejs/webhooks` verifies
  the `Webhook-Signature` (HMAC-SHA256, timing-safe) and returns the `events` array.
  It throws `InvalidSignatureError` if the signature doesn't match.
- A webhook is a **batch** of up to 250 events. Each event is dispatched by
  `resource_type` + `action`. Return `204 No Content` to acknowledge the batch.
- GoCardless retries the whole batch on any non-2xx, so keep handlers **idempotent on
  `event.id`**.

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
