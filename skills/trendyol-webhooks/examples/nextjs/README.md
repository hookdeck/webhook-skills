# Trendyol Webhooks - Next.js Example

Minimal example of receiving Trendyol order package webhooks and authenticating them with the
`x-api-key` header.

Trendyol does not sign payloads, so there is no HMAC to verify. With `authenticationType`
`API_KEY`, Trendyol sends the webhook's `apiKey` as plain text in the `x-api-key` header, and the
handler compares the whole value with `TRENDYOL_WEBHOOK_SECRET` in constant time. The route reads
the body with `request.text()`, so any content type works. Basic authentication
(`BASIC_AUTHENTICATION`) is not covered by Hookdeck's Trendyol source.

> Choose API key authentication (authenticationType API_KEY) when you create the Trendyol webhook.

## Prerequisites

- Node.js 20+
- A Trendyol seller account with API access (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `TRENDYOL_WEBHOOK_SECRET` to the `apiKey` you use when creating the webhook.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/trendyol`.

## Test

```bash
npm test
```

The tests send every documented package status with correct, wrong and missing keys. No Trendyol
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/trendyol \
  -H "Content-Type: application/json" \
  -H "x-api-key: $TRENDYOL_WEBHOOK_SECRET" \
  -d '{"content":[{"orderNumber":"10654411111","shipmentPackageId":3330111111,"status":"Delivered"}]}'
```

## Receive Webhooks Locally

Trendyol can't reach `localhost`, and rejects webhook URLs containing "Trendyol", "Dolap" or
"Localhost". Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 trendyol --path /webhooks/trendyol
```

## How It Works

- `lib/verify-trendyol.ts`: `verifyTrendyolRequest()`
- `app/webhooks/trendyol/route.ts`: the `POST` handler

1. The `x-api-key` header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object with a `content` array (`400` otherwise).
3. For each package in `content[]`, the handler dispatches on `status` (case-insensitive):
   `CREATED`, `PICKING`, `INVOICED`, `SHIPPED`, `CANCELLED`, `DELIVERED`, `UNDELIVERED`,
   `RETURNED`, `UNSUPPLIED`, `AWAITING`, `UNPACKED`, `AT_COLLECTION_POINT`, `VERIFIED`.
4. It returns `200 {"received": true}`. Failed requests are re-sent every 5 minutes, so keep
   handlers idempotent.
