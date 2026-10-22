# Go1 Webhooks - Express Example

Minimal example of receiving Go1 webhooks with `Go1-Signature` verification.

## Prerequisites

- Node.js 18+
- A Go1 webhook with a `secret_key` set

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook `secret_key` to `.env` as `GO1_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/go1`.

## Test

Run the tests (they generate real HMAC-SHA256 signatures):

```bash
npm test
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 go1 --path /webhooks/go1
```

Use the tunnel URL as the webhook URL when you create the Go1 webhook.

## How verification works

The `Go1-Signature` header is `t=<unix milliseconds>,v1=<hex>`. The handler reads the raw body with `express.raw({ type: '*/*' })` (so any content type verifies), computes `hex(HMAC-SHA256(secret_key, "<t>.<rawBody>"))` using `t` exactly as received, compares it timing-safely with `v1`, and leaves the timestamp check off by default, because Hookdeck's retries and replays keep the original `t`. Set `GO1_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to turn it on (`t` is compared in milliseconds). See [../../references/verification.md](../../references/verification.md).
