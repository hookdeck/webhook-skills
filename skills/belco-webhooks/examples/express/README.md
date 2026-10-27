# Belco Webhooks - Express Example

Minimal example of receiving Belco webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Belco account with a webhook created through the API (its `secret` is the signing secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
3. Add the webhook's `secret` (the `secret` property returned by `POST /webhooks`) to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 belco --path /webhooks/belco
```

Then use the Hookdeck URL as the `url` when creating the webhook with `POST /webhooks`. The handler
reads the body with `express.raw({ type: '*/*' })` so the exact bytes are verified against
`x-hook-signature`, and dedupes on `requestId`.
