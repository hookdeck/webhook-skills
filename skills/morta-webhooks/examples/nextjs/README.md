# Morta Webhooks - Next.js Example

Minimal example of receiving Morta webhooks with `Morta-Signature` verification.

## Prerequisites

- Node.js 18+
- A Morta hub with access to Hub > Settings (for the signing secret and webhook notifications)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your hub signing secret (Hub > Settings > Secrets) to `.env` as `MORTA_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/morta`.

## Test

Run the tests (they generate real HMAC-SHA256 signatures):

```bash
npm test
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 morta --path /webhooks/morta
```

Use the tunnel URL as the endpoint URL of a notification in Hub > Settings > Webhooks.

## How verification works

The `Morta-Signature` header is `t=<unix>,v1=<hex>`. The handler reads the raw body with `await request.arrayBuffer()`, computes `hex(HMAC-SHA256(secret, "<t>.<rawBody>"))` over the `t` string exactly as sent plus the raw bytes, validates each `v1` as 64 hex characters, and compares in constant time (any `v1` may match). A missing, malformed, or mismatched signature gets `401`. The timestamp check is off by default, because Hookdeck retries and replays keep the original `t`; set `MORTA_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to turn it on. The `change` field is a JSON-encoded string and is parsed a second time. See [../../references/verification.md](../../references/verification.md).
