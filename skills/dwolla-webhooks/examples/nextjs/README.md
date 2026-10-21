# Dwolla Webhooks - Next.js Example

Minimal example of receiving Dwolla webhooks with signature verification, using the App Router.

## Prerequisites

- Node.js 18+
- Dwolla account with a webhook subscription (you choose the subscription secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `DWOLLA_WEBHOOK_SECRET` in `.env.local` to the `secret` you sent when creating the Dwolla webhook subscription.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, with the webhook endpoint at `/webhooks/dwolla`.

## Test

Run the automated tests (they generate real HMAC-SHA256 signatures):

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 dwolla --path /webhooks/dwolla
```

Use the Hookdeck source URL as the `url` when creating the Dwolla webhook subscription.

## Notes

- Signature header: `X-Request-Signature-SHA-256` (hex HMAC-SHA256 of the raw body).
- The route reads the body with `request.text()` so the bytes are never re-encoded.
- Duplicate event IDs return 200 so Dwolla doesn't pause the subscription.
