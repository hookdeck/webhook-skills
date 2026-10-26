# Holded Webhooks - Express Example

Minimal example of receiving Holded webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Holded account with a webhook configured under Settings > Webhooks

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Holded webhook secret to `.env`. Paste the whole value, including the `whsec_` prefix: Holded uses it as a plain HMAC key (this is not Standard Webhooks, so don't use `svix` or `standardwebhooks`).

## Run

```bash
npm start
```

Server runs on http://localhost:3000, webhook endpoint `POST /webhooks/holded`.

The route uses `express.raw({ type: '*/*' })` so the exact signed bytes are available for any content type.

## Test

```bash
npm test
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 3000 holded --path /webhooks/holded
```

Register the Hookdeck URL in Holded under Settings > Webhooks, then create or update an invoice or contact.
