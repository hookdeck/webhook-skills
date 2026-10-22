# Medusa Webhooks - Next.js Example

Minimal example of receiving Medusa Cloud webhooks with `X-Medusa-Signature` verification.

## Prerequisites

- Node.js 18+
- A Medusa Cloud organization (Launch, Scale, or Enterprise plan) with a webhook endpoint and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your endpoint's signing secret (the **Signing Secret** on the endpoint card in Cloud) to `.env` as `MEDUSA_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/medusa` (`app/webhooks/medusa/route.ts`, verification in `lib/medusa.ts`).

## Test

Run the tests with Vitest (they generate real HMAC-SHA256 signatures):

```bash
npm test
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 medusa --path /webhooks/medusa
```

Use the tunnel URL as the **Endpoint URL** on **Webhooks > Endpoints** in Medusa Cloud, then push a commit to trigger a build (`build.created`).

## How verification works

The `X-Medusa-Signature` header is `t=<unix>,v1=<hex>`. The route reads the raw body with `await request.text()` (any content type), computes `hex(HMAC-SHA256(secret, "<t>.<rawBody>"))`, compares it timing-safely with `v1`, and leaves the timestamp check off by default: Medusa re-signs its own retries, but Hookdeck retries and replays resend the original `t`. Set `MEDUSA_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds (the docs suggest `300`) to turn it on. See [../../references/verification.md](../../references/verification.md).
