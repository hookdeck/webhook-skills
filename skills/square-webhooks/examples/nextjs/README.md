# Square Webhooks - Next.js Example

Minimal example of receiving Square webhooks in a Next.js App Router route
handler with signature verification using the official
[`square`](https://www.npmjs.com/package/square) SDK
(`WebhooksHelper.verifySignature`).

## Prerequisites

- Node.js 18+
- A Square webhook subscription with a **signature key** and **notification URL**
  (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Square signature key and notification URL to `.env`:
   ```bash
   SQUARE_WEBHOOK_SIGNATURE_KEY=your_signature_key
   SQUARE_WEBHOOK_URL=https://your-app.com/webhooks/square
   ```

   > The notification URL is part of the signed content, so `SQUARE_WEBHOOK_URL`
   > must match the URL registered on your Square subscription exactly.

## Run

```bash
npm run dev
```

The webhook handler is at `POST /webhooks/square`
(`app/webhooks/square/route.ts`), served from http://localhost:3000.

## Local Testing

Expose your local server with the Hookdeck CLI (no account required) and use the
tunnel URL as your Square subscription's notification URL:

```bash
npx hookdeck-cli listen 3000 square --path /webhooks/square
```

Set `SQUARE_WEBHOOK_URL` to the same public tunnel URL, then trigger a test
event from **Webhooks → Subscriptions → Send Test Event** in the Square
Developer Console.

## Test

```bash
npm test
```

The tests generate valid Square signatures —
`base64(HMAC-SHA256(notificationUrl + body, signatureKey))` — and assert the
route returns `200` for valid signatures and `400` for missing, invalid, or
tampered requests.
