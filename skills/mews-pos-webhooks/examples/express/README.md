# Mews POS Webhooks - Express Example

Minimal example of receiving Mews POS API webhooks with `X-Signature` verification.

Mews signs the raw body with HMAC-SHA256 and sends the bare, padded Base64 digest in `X-Signature`. The handler reads the raw bytes, validates the header format, compares the Base64 string in constant time, and only then parses the JSON. Nothing else is signed, so there is no timestamp check.

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
   cp .env.example .env
   ```

3. Set `MEWS_POS_WEBHOOK_SECRET` to your secret key in `.env`

## Run

```bash
npm start
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

- `src/index.js`: `verifyMewsPosSignature()` plus the `POST /webhooks/mews-pos` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type works.
2. `X-Signature` must be 44-character padded Base64 and equal the HMAC-SHA256 of the body. Failure returns `401`.
3. The body must be a JSON object with `meta.eventType` (`400` otherwise); nested fields are type-checked before use.
4. The handler switches on `meta.eventType`: `booking.status.updated`, `order.state.updated`, `order.status.updated`, `order.total.updated`, `order.payments.added`, `product.availability.updated`. Unknown events are logged.
5. It returns `200 {"received": true}`.
