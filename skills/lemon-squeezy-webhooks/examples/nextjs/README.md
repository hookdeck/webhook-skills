# Lemon Squeezy Webhooks - Next.js Example

Minimal example of receiving Lemon Squeezy webhooks with signature verification in a Next.js App Router route handler.

## Prerequisites

- Node.js 18+
- Lemon Squeezy account with a webhook and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add the signing secret you entered when creating the webhook (Settings > Webhooks) to `.env.local` as `LEMON_SQUEEZY_SIGNING_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/lemon-squeezy`.

## Test

Run the automated tests (they generate real `X-Signature` values):

```bash
npm test
```

To receive real webhooks locally, start a tunnel (no account required):

```bash
npx hookdeck-cli listen 3000 lemon-squeezy --path /webhooks/lemon-squeezy
```

Paste the URL it prints into the webhook's Callback URL in Lemon Squeezy, then use **Simulate webhook event** (Settings > Webhooks) or place a test mode order.

## How verification works

`X-Signature` is the hex HMAC-SHA256 of the **raw** request body, keyed with your signing secret. The route reads the body with `request.text()` (never `request.json()`) and compares with `crypto.timingSafeEqual`.
