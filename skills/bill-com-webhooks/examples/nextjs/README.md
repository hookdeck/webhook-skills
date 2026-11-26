# BILL Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [BILL](https://www.bill.com) (Bill.com) webhooks and verifying the `x-bill-sha-signature` HMAC.

## Prerequisites

- Node.js 18+
- A BILL developer account (the sandbox is free) and a Connect Events subscription (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `BILL_WEBHOOK_SECURITY_KEY` in `.env.local` to the subscription's `securityKey`, as-is.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/bill-com` in [app/webhooks/bill-com/route.ts](app/webhooks/bill-com/route.ts); the verification code is in [lib/verify-bill-com.ts](lib/verify-bill-com.ts).

## Test

```bash
npm test
```

The tests cover a valid signature over BILL's test notification, a hex digest (rejected), a pretty-printed copy of the body (rejected), another key, a tampered body, a missing header, a trailing newline in the key, invalid JSON, and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 bill-com --path /webhooks/bill-com
```

Create a sandbox subscription with the printed URL as `notificationUrl`, then send a signed test with `POST /v3/subscriptions/{subscriptionId}/test`.

## Notes

- The route reads `request.arrayBuffer()` before parsing. BILL signs the compact body it sends, so don't call `request.json()` first.
- BILL treats anything but HTTP `200` within 10 seconds as a failure.
