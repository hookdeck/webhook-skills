# Violet Webhooks - Express Example

Minimal example of receiving Violet webhooks with `X-Violet-Hmac` signature verification.

## Prerequisites

- Node.js 18+
- A Violet channel app and its app secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Violet app secret to `.env` as `VIOLET_WEBHOOK_SECRET` (the same secret you send as `X-Violet-App-Secret` to the Violet API)

## Run

```bash
npm start
```

Server runs on http://localhost:3000, with the webhook endpoint at `POST /webhooks/violet`.

## Test

```bash
npm test
```

The tests sign each request the way Violet does (base64 HMAC-SHA256 of the raw body) and cover bad, missing and malformed signatures.

To receive real webhooks locally, start a tunnel:

```bash
npx hookdeck-cli listen 3000 violet --path /webhooks/violet
```

Then register the tunnel URL as the `remote_endpoint` of a webhook, using `POST /v1/events/webhooks` on the Violet API (see `references/setup.md`).

## How it works

- `express.raw({ type: '*/*' })` keeps the exact request bytes for any content type
- The signature is checked first (401 on failure), then the body is parsed
- The event comes from the `X-Violet-Topic` header; the body is the entity itself
