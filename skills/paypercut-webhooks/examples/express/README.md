# Paypercut Webhooks - Express Example

Minimal example of receiving Paypercut webhooks and verifying the `Paypercut-Signature` header (hex HMAC-SHA256 over `{t}.{raw body}`).

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
   cp .env.example .env
   ```

3. Put your endpoint's signing secret into `.env` as `PAYPERCUT_WEBHOOK_SECRET`. Optionally set `PAYPERCUT_WEBHOOK_TOLERANCE_SECONDS` (off by default; see [references/verification.md](../../references/verification.md)).

## Run

```bash
npm start
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
