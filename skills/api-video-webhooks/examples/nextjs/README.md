# api.video Webhooks - Next.js Example

Minimal example of receiving api.video webhooks with signature verification (App Router).

## Prerequisites

- Node.js 18+
- An api.video account with a webhook and its `signatureSecret`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add the webhook's `signatureSecret` (`sig_sec_...`) to `.env.local` as `API_VIDEO_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 api-video --path /webhooks/api-video
```

Use the Hookdeck URL as the webhook URL when you create the webhook (dashboard or `POST /webhooks`).

## Endpoint

- `POST /webhooks/api-video` - Verifies `X-Api-Video-Signature` (hex HMAC-SHA256 of the raw body, read with `request.arrayBuffer()`) and dispatches on the body's `type`

## Run tests

```bash
npm test
```
