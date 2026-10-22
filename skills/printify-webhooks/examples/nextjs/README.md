# Printify Webhooks - Next.js Example

Minimal example of receiving Printify webhooks in a Next.js App Router route handler with `X-Pfy-Signature` HMAC-SHA256 verification.

## Prerequisites

- Node.js 18+
- A Printify shop and API token with the `webhooks.write` scope
- A webhook created through the API with a `secret` (Printify webhooks are API-only)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `PRINTIFY_WEBHOOK_SECRET` in `.env.local` to the `secret` you passed when creating the webhook.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, and the webhook endpoint is `POST /webhooks/printify`.

## Test

```bash
npm test
```

The tests sign payloads with Printify's algorithm, `sha256=` + `hex(HMAC-SHA256(secret, raw body))`, and cover valid, tampered, malformed and wrong-length signatures, non-JSON content types, and every event type.

## How Verification Works

1. The route reads the **raw** body with `request.text()` before any JSON parsing, so any content type verifies.
2. It checks `X-Pfy-Signature` has the form `sha256=<hex>` and strips the prefix.
3. It computes `HMAC-SHA256(secret, raw body)` as hex, using the secret as a UTF-8 string, and compares it timing-safely.
4. Printify sends no timestamp, so there is no replay window. Dedupe on the event `id`.

Handled events: `order:created`, `order:updated`, `order:line-item:canceled`, `order:sent-to-production`, `order:shipment:created`, `order:shipment:delivered`, `product:created`, `product:updated`, `product:publish:started`, `product:deleted`, `shop:disconnected`, `personalization-preview-task:processed`.

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 3000 printify --path /webhooks/printify
```

Create a webhook with the printed URL via `POST /v1/shops/{shop_id}/webhooks.json` (include your `secret`), then call `POST /v1/shops/{shop_id}/webhooks/{webhook_id}/simulate` to send a test delivery.
