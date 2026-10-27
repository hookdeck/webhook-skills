# Optimizely Webhooks - Next.js Example

Minimal example of receiving Optimizely Feature Experimentation webhooks with `X-Hub-Signature` (HMAC-SHA1) verification, using the App Router.

## Prerequisites

- Node.js 18+
- An Optimizely Feature Experimentation project with a webhook (Settings → Webhooks) and its secret token

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your webhook secret token to `.env.local` as `OPTIMIZELY_WEBHOOK_SECRET` (Optimizely shows it only once, right after the webhook is created)

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 optimizely --path /webhooks/optimizely
```

Use the printed URL as the webhook URL in Optimizely, then publish a change to trigger `project.datafile_updated`.

### Run tests

```bash
npm test
```

The tests include the test vector published in Optimizely's docs. The route reads the body with `request.arrayBuffer()` so the exact bytes are verified. See [../../references/verification.md](../../references/verification.md).
