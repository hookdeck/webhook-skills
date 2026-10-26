# Bindbee Webhooks - Express Example

Minimal example of receiving Bindbee webhooks (version 2) with Standard Webhooks signature verification. It verifies by hand rather than with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) or [`svix`](https://www.npmjs.com/package/svix) libraries, because Bindbee's secret is used as raw UTF-8 bytes (the libraries base64-decode it) and because Hookdeck retries and replays keep the original timestamp, so the 5-minute window is opt-in via `BINDBEE_WEBHOOK_TOLERANCE_SECONDS`.

Only version 2 webhooks are supported. Version 1 webhooks lack the `webhook-*` headers and fail verification.

## Prerequisites

- Node.js 18+
- A Bindbee account with a version 2 webhook and the security signature secret from the dashboard's Webhooks page

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your security signature secret to `.env` (`BINDBEE_WEBHOOK_SECRET`), exactly as shown on the dashboard (no `whsec_` prefix)

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

## Webhook Endpoint

```
POST http://localhost:3000/webhooks/bindbee
```

The handler reads the body with `express.raw({ type: '*/*' })`, verifies it, and only then parses the JSON.

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 3000 bindbee --path /webhooks/bindbee
```

Use the printed URL as the webhook URL in the Bindbee dashboard (Webhooks > Add webhook). Bindbee rejects request-inspection hosts such as webhook.site, so a tunnel to your own endpoint is the way to test locally.
