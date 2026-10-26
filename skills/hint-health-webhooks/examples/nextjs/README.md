# Hint Health Webhooks - Next.js Example

Minimal example of receiving Hint Health webhooks with `X-Hint-Signature` (`sha256=` + hex HMAC-SHA256 of the raw body) verification, using the App Router.

## Prerequisites

- Node.js 18+
- A Hint Health partner API key chosen as the webhooks signature key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your webhooks signature key to `.env.local` as `HINT_HEALTH_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and the route is `POST /webhooks/hint-health`.

## Test

```bash
npm test
```

To receive real events locally, run the Hookdeck CLI in another terminal and use the URL it prints as your webhook URL:

```bash
npx hookdeck-cli listen 3000 hint-health --path /webhooks/hint-health
```
