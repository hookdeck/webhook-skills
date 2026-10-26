# Autotask Webhooks - Next.js Example

Minimal example of receiving Autotask webhooks with `X-Hook-Signature` (HMAC-SHA1) verification, using the App Router.

## Prerequisites

- Node.js 18+
- An Autotask webhook created through the REST API, with a `SecretKey` and a `WebhookUrl` pointing at this server

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `AUTOTASK_WEBHOOK_SECRET` in `.env.local` to the `SecretKey` you used when creating the webhook

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The handler is `app/webhooks/autotask/route.ts`.

## Test

```bash
npm test
```

To receive real callouts locally, run the Hookdeck CLI (no install or account needed) and use the URL it prints as your webhook's `WebhookUrl`:

```bash
npx hookdeck-cli listen 3000 autotask --path /webhooks/autotask
```
