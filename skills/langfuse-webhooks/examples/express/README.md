# Langfuse Webhooks - Express Example

Minimal example of receiving Langfuse webhooks (prompt version `created`, `updated` and `deleted`
notifications) with `x-langfuse-signature` verification.

Langfuse signs each delivery with `t=<timestamp>,v1=<hex>`, where `v1` is the hex HMAC-SHA256 of
`<timestamp>.<raw body>` keyed with your webhook's signing secret. The route reads the body with
`express.raw({ type: '*/*' })` so the exact bytes are verified, and parses JSON only afterwards.

## Prerequisites

- Node.js 18+
- A Langfuse project with a prompt-management Automation using a "Webhook Call" action (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `LANGFUSE_WEBHOOK_SECRET` to the signing secret Langfuse showed when you created the webhook.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts `POST /webhooks/langfuse`.

## Test

```bash
npm test
```

The tests sign payloads with the same algorithm Langfuse uses. No Langfuse account is needed.

## Receive Webhooks Locally

Langfuse can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 langfuse --path /webhooks/langfuse
```

Use the printed URL as the webhook URL on the Langfuse automation.

## How It Works

- `src/index.js`: `verifyLangfuseSignature()` plus the `POST /webhooks/langfuse` route

1. A missing `x-langfuse-signature` header, a malformed value or a mismatch returns `401`.
2. The header is split on `,` and `=`; `t` is used exactly as sent. Any `v1=` entry may match; `v0` and other keys are ignored. Each candidate must be 64 hex characters (case-insensitive) and is compared with `crypto.timingSafeEqual`.
3. The body is parsed only after verification (`400` if it is not JSON). The handler dispatches on `action`: `created`, `updated`, `deleted`; anything else is logged and acknowledged.
4. It returns `200 {"received": true}`.

**Timestamp tolerance is off by default.** Hookdeck retries and replays resend the original headers, so a fixed window would reject legitimate retries. To opt in, set `LANGFUSE_WEBHOOK_TOLERANCE_SECONDS` (for example `300`); `t` is Unix seconds.
