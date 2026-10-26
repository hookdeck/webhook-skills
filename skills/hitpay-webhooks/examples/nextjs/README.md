# HitPay Webhooks - Next.js Example

Minimal example of receiving HitPay event webhooks and verifying the `Hitpay-Signature` header.

The signature is the hex HMAC-SHA256 of the raw request body, keyed with the **per-webhook salt**
shown on the webhook's detail view (Developers > Webhooks). Legacy payment-request and charge
callbacks (form-encoded, an `hmac` field in the payload, keyed with the API-key salt) use a
different scheme and are **not** covered.

## Prerequisites

- Node.js 20+
- A HitPay account with an event webhook registered (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `HITPAY_WEBHOOK_SALT` to the salt from the webhook's detail view in the HitPay dashboard.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/hitpay`.

## Test

```bash
npm test
```

The tests sign bodies with HMAC-SHA256 the same way HitPay does, covering valid, tampered, wrong-salt
and malformed signatures and each event.

## Receive HitPay Webhooks Locally

Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 hitpay --path /webhooks/hitpay
```

Paste the printed URL into HitPay Dashboard > Developers > Webhooks as the webhook URL.

## How It Works

- `lib/verify-hitpay.ts`: `verifyHitpaySignature()`; `app/webhooks/hitpay/route.ts`: the `POST /webhooks/hitpay` route

1. The body is read as raw bytes with `request.arrayBuffer()`, so any content type verifies.
2. `Hitpay-Signature` must be exactly 64 hex characters; it is compared to the computed HMAC with
   `crypto.timingSafeEqual` on equal-length buffers. A bad signature returns `401`; an unset salt rejects everything.
3. The body has no event name. The event is `{Hitpay-Event-Object}.{Hitpay-Event-Type}` (for example
   `charge.created`, `order.created`, `transfer.paid`); missing headers return `400`.
4. It returns `200 {"received": true}` quickly. Key side effects on the object `id`, since webhooks can repeat.
