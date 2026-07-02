# Razorpay Webhooks - Next.js Example

Minimal example of receiving Razorpay webhooks in a Next.js App Router route
handler, verified with the official `razorpay` Node SDK
(`validateWebhookSignature`).

## Prerequisites

- Node.js 18+
- A Razorpay account with a webhook configured (and its secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Razorpay webhook secret to `.env` as `RAZORPAY_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

The webhook endpoint is `POST /webhooks/razorpay` (served at
http://localhost:3000/webhooks/razorpay).

## Test

Run the tests (they generate real HMAC-SHA256 signatures and exercise the route
handler):

```bash
npm test
```

## Receive Real Webhooks Locally

Use the Hookdeck CLI to tunnel Razorpay webhooks to your local server (no
install, no account required):

```bash
npx hookdeck-cli listen 3000 razorpay --path /webhooks/razorpay
```

Point your Razorpay dashboard webhook URL at the tunnel URL the CLI prints, then
trigger a test-mode payment to see events arrive.

## How It Works

- The route reads the **raw body** with `await request.text()` before parsing —
  parsing JSON first would break the HMAC.
- `verifyRazorpayWebhook` calls `Razorpay.validateWebhookSignature(rawBody,
  signature, secret)`, which recomputes HMAC-SHA256 (hex) over the raw body and
  compares it to the `X-Razorpay-Signature` header.
- An invalid or missing signature returns **400**; verified events return
  **200**.
- The event type comes from the JSON body's `event` field.
