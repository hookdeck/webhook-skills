# Paypercut Webhooks - Next.js Example

Minimal example of receiving Paypercut webhooks in the App Router and verifying the `Paypercut-Signature` header (hex HMAC-SHA256 over `{t}.{raw body}`).

## Prerequisites

- Node.js 18+
- A Paypercut webhook endpoint and its signing secret (see [references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put your endpoint's signing secret into `.env.local` as `PAYPERCUT_WEBHOOK_SECRET`. Optionally set `PAYPERCUT_WEBHOOK_TOLERANCE_SECONDS` (off by default; see [references/verification.md](../../references/verification.md)).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts GET, POST, PUT, PATCH and DELETE on `/webhooks/paypercut`.

## Test

```bash
npm test
```

To receive real webhooks locally, tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 paypercut --path /webhooks/paypercut
```
