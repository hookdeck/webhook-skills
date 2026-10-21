# Signal Sciences Webhooks - Next.js Example

Minimal example of receiving Signal Sciences (Fastly Next-Gen WAF) generic webhooks with `X-SigSci-Signature` verification, using the App Router.

## Prerequisites

- Node.js 18+
- A Fastly Next-Gen WAF generic webhook integration and its signing key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add the integration's signing key (Reveal in the console) to `.env.local` as `SIGNAL_SCIENCES_SIGNING_KEY`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The endpoint is `POST /webhooks/signal-sciences` (`app/webhooks/signal-sciences/route.ts`); verification lives in `lib/verify.ts`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 signal-sciences --path /webhooks/signal-sciences
```

Use the URL it prints as the **Webhook URL** of the integration.

## Test

```bash
npm test
```

Tests sign payloads with the same hex HMAC-SHA256 algorithm Fastly uses.
