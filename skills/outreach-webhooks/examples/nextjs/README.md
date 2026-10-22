# Outreach Webhooks - Next.js Example

Minimal example of receiving Outreach webhooks with signature verification (`Outreach-Webhook-Signature`, hex HMAC-SHA256 of the raw body) in the App Router.

## Prerequisites

- Node.js 18+
- An Outreach app with API access, and a webhook **created with a `secret`** (Outreach only signs when one is set)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put the `secret` you set on the webhook in `.env.local` as `OUTREACH_WEBHOOK_SECRET`.

4. Create the webhook through the API, including `secret` (see `../../references/setup.md`).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To receive real Outreach deliveries locally, use the Hookdeck CLI (no install or account needed):

```bash
npx hookdeck-cli listen 3000 outreach --path /webhooks/outreach
```

Use the URL it prints as the webhook's `url` when you create it.

## Endpoint

`POST /webhooks/outreach` returns `200` for a valid signature, `400` for a missing or invalid signature or invalid JSON, and `500` if `OUTREACH_WEBHOOK_SECRET` is not set. The route reads `request.text()` so the signed bytes are untouched.
