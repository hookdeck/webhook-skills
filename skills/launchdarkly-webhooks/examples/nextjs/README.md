# LaunchDarkly Webhooks - Next.js Example

Minimal example of receiving LaunchDarkly webhooks with `X-LD-Signature` verification using the App Router.

## Prerequisites

- Node.js 18+
- LaunchDarkly webhook with **Sign this webhook** enabled (signing is optional; unsigned deliveries are rejected here)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your webhook secret to `.env.local`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The route is `app/webhooks/launchdarkly/route.ts`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 launchdarkly --path /webhooks/launchdarkly
```

Use the Hookdeck URL as the webhook URL in LaunchDarkly.

## Test

```bash
npm test
```

Tests generate real HMAC-SHA256 signatures over the raw body.
