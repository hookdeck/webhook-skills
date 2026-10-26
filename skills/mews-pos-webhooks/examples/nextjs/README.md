# Mews POS Webhooks - Next.js Example

Minimal example of receiving Mews POS API webhooks with `X-Signature` verification, using the Next.js App Router.

Mews signs the raw body with HMAC-SHA256 and sends the bare, padded Base64 digest in `X-Signature`. The route reads the raw bytes with `request.arrayBuffer()`, validates the header format, compares the Base64 string in constant time, and only then parses the JSON. Nothing else is signed, so there is no timestamp check.

## Prerequisites

- Node.js 18+
- A Mews POS API webhook and its secret key (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `MEWS_POS_WEBHOOK_SECRET` to your secret key in `.env.local`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/mews-pos`.

## Test

```bash
npm test
```

The tests sign the documented `booking.status.updated` shape (and the other events) with the same algorithm Mews uses, and check missing, malformed, non-canonical and mismatching signatures.

## Receive Mews POS Webhooks Locally

```bash
npx hookdeck-cli listen 3000 mews-pos --path /webhooks/mews-pos
```

Use the printed URL as the webhook URL in Mews.

## How It Works

- `lib/verify-mews-pos.ts`: `verifyMewsPosSignature()`
- `app/webhooks/mews-pos/route.ts`: the `POST` handler

1. `X-Signature` must be 44-character padded Base64 and equal the HMAC-SHA256 of the raw body. Failure returns `401`.
2. The body must be a JSON object with `meta.eventType` (`400` otherwise); nested fields are type-checked before use.
3. The handler switches on `meta.eventType`: `booking.status.updated`, `order.state.updated`, `order.status.updated`, `order.total.updated`, `order.payments.added`, `product.availability.updated`. Unknown events are logged.
4. It returns `200 {"received": true}`.
