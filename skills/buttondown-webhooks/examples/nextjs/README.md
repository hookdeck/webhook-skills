# Buttondown Webhooks - Next.js Example

Minimal example of receiving Buttondown webhooks with `X-Buttondown-Signature` verification.

## Prerequisites

- Node.js 18+
- Buttondown account with a webhook that has a **signing key** set

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the webhook's signing key in `.env` as `BUTTONDOWN_WEBHOOK_SECRET`. It is any string you chose in the webhook's "Signing key" field, used as-is. Set a signing key on the Buttondown webhook. Without one, deliveries are unsigned and fail verification.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

The route reads the raw bytes with `await request.arrayBuffer()`, verifies `X-Buttondown-Signature` (`sha256=<hex HMAC-SHA256 of the raw body>`; the prefix is optional here), then dispatches on the payload's `event_type` (for example `subscriber.created`, `subscriber.confirmed`, `email.sent`). Failures return `401`. No timestamp is signed, so there is no replay window.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 buttondown --path /webhooks/buttondown
```

Use the Hookdeck URL as the webhook URL in Buttondown, with the same signing key in Hookdeck's Buttondown source.
