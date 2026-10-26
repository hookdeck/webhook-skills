# Uploadcare Webhooks - Next.js Example

Minimal example of receiving Uploadcare webhooks with `X-Uc-Signature` verification.

## Prerequisites

- Node.js 18+
- An Uploadcare project with a webhook that has a `signing_secret`

> Set a signing_secret on the Uploadcare webhook. Without one, deliveries are unsigned and fail verification.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the webhook's signing secret in `.env` as `UPLOADCARE_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts `POST /webhooks/uploadcare`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 uploadcare --path /webhooks/uploadcare
```

Use the printed URL as the webhook's target URL in Uploadcare, then upload a file to trigger `file.uploaded`.

## Test

```bash
npm test
```

The tests sign payloads with HMAC-SHA256 the way Uploadcare does (`v1=` + hex of the raw body).
