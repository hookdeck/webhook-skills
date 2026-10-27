# Qonto Webhooks - Next.js Example

Minimal example of receiving Qonto Business API webhooks with signature verification (`X-Qonto-Signature`, HMAC-SHA256 over `{t}.{raw body}`) in the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Qonto Business API webhook subscription and its secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your subscription secret to `.env.local` as `QONTO_WEBHOOK_SECRET`. Paste the whole secret, including the whsec_ prefix. Qonto uses it as a plain HMAC key.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts `POST /webhooks/qonto`.

## Test

```bash
npm test
```

The suite includes the worked example from Qonto's docs (secret `test-secret`, body `{"test":"data"}`, `t=1704110400`).

To receive real deliveries locally, use the Hookdeck CLI (no install, no account needed):

```bash
npx hookdeck-cli listen 3000 qonto --path /webhooks/qonto
```

Then use the URL it prints as the subscription's `callback_url` (`POST /v2/webhook_subscriptions`).

## Notes

- The route reads the raw bytes with `await request.arrayBuffer()` and parses JSON only after verifying. Verification lives in `lib/qonto.ts`.
- Do not use the `standardwebhooks` or `svix` libraries: the secret looks like a Standard Webhooks one but is used whole, as a plain key, with a hex digest.
- Qonto expects a 2xx within 1 second, so the route replies first and processes afterwards. On serverless hosts, hand real work to a queue rather than relying on work after the response.
- Set `QONTO_WEBHOOK_TOLERANCE_SECONDS` to opt into rejecting old timestamps (off by default, since retries keep the original `t`).
