# Square Webhooks - Express Example

Minimal example of receiving Square webhooks with signature verification using
the official [`square`](https://www.npmjs.com/package/square) SDK
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
npm start
```

Server runs on http://localhost:3000 with the webhook endpoint at
`POST /webhooks/square`.

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
endpoint returns `200` for valid signatures and `400` for missing, invalid, or
tampered requests.
