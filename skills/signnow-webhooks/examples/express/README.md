# SignNow Webhooks - Express Example

Minimal example of receiving SignNow webhooks (event subscriptions) with signature verification.

## Prerequisites

- Node.js 18+
- A SignNow API account (API Dashboard access)
- An event subscription created **with a `secret_key`**. Without one, SignNow sends unsigned callbacks and verification can't work.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Set `SIGNNOW_WEBHOOK_SECRET` in `.env` to the same `secret_key` you set on the subscription.

## Run

```bash
npm start
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/signnow`.

## Test

```bash
npm test
```

The tests sign payloads with `base64(HMAC-SHA256(secret, rawBody))`, the same way SignNow does, and cover bad/missing/hex signatures, tampered bodies, non-JSON content types and event dispatch.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 signnow --path /webhooks/signnow
```

No account required. Use the printed HTTPS URL as the `callback` when you create the event subscription (`POST /v2/event-subscriptions`, or API Dashboard → Webhooks), then complete a document to trigger `document.complete`.

## Notes

- The handler is in `src/index.js`.
- The body is read with `express.raw({ type: '*/*' })` so the HMAC covers the exact bytes whatever the `Content-Type`.
- The signature is **base64**, not hex, and there is no timestamp in the signed content.
- See [../../references/verification.md](../../references/verification.md) for details and debugging.
