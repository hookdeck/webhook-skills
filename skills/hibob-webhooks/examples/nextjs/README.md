# HiBob (Bob) Webhooks - Next.js Example

Minimal example of receiving HiBob (Bob) webhooks with `Bob-Signature` (HMAC-SHA512, base64) verification, using the App Router.

## Prerequisites

- Node.js 18+
- A Bob account with a webhook configured and its secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Bob webhook secret to `.env` as `HIBOB_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The webhook route is `/webhooks/hibob`.

## Test

```bash
npm test
```

To receive real events locally, run the Hookdeck CLI in another terminal and use the URL it prints as the webhook URL in Bob:

```bash
npx hookdeck-cli listen 3000 hibob --path /webhooks/hibob
```

Bob sends a `Ping test` request when you add the webhook; the route returns `200` for it.
