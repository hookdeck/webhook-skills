# Razorpay Webhooks - Express Example

Minimal example of receiving Razorpay webhooks with signature verification using
the official `razorpay` Node SDK (`validateWebhookSignature`).

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
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at
`POST /webhooks/razorpay`.

## Test

Run the unit/integration tests (they generate real HMAC-SHA256 signatures):

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

- The route uses `express.raw({ type: 'application/json' })` so the **raw body**
  is available for signature verification (parsing JSON first would break the
  HMAC).
- `verifyRazorpayWebhook` calls `Razorpay.validateWebhookSignature(rawBody,
  signature, secret)`, which recomputes the HMAC-SHA256 (hex) over the raw body
  and compares it to the `X-Razorpay-Signature` header.
- An invalid or missing signature returns **400**; verified events return
  **200**.
- The event type comes from the JSON body's `event` field.
