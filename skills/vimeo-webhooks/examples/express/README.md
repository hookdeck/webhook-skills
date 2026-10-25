# Vimeo Webhooks - Express Example

Minimal example of receiving Vimeo app webhooks with signature verification
using Express. Vimeo has no webhook SDK, so the `X-Webhook-Signature` header is
verified **manually** with Node's `crypto` module.

## Prerequisites

- Node.js 18+
- A Vimeo app webhook with a `secret` set (deliveries are unsigned without one)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook `secret` you set through the Vimeo API to `.env`:
   ```bash
   VIMEO_WEBHOOK_SECRET=your_webhook_secret
   ```

   Create or update the webhook with a `secret` (`POST` or `PATCH`
   `/apps/{app_id}/webhooks`); see the skill's `references/setup.md`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 with the webhook endpoint at
`POST /webhooks/vimeo`.

## Test

Run the automated tests (they generate real HMAC-SHA256 signatures):

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Vimeo webhooks to your local server (no account
required):

```bash
npx hookdeck-cli listen 3000 vimeo --path /webhooks/vimeo
```

Set the public URL the CLI prints as the webhook's `webhook_url` through the
Vimeo API.

## How It Works

- The route uses `express.raw({ type: '*/*' })` so the **raw body** is available
  for any content type; parsing JSON first would break the signature.
- `verifyVimeo()` recomputes the hex HMAC-SHA256 of the raw body, checks the
  header is 64 hex characters, and compares in constant time.
- The event name is the `webhook_type` field in the body.
- Missing or invalid signatures return `401`; verified events return `200`.
