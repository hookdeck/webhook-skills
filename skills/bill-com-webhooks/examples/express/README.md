# BILL Webhooks - Express Example

Minimal Express example of receiving [BILL](https://www.bill.com) (Bill.com) webhooks and verifying the `x-bill-sha-signature` HMAC.

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
   cp .env.example .env
   ```

3. Set `BILL_WEBHOOK_SECURITY_KEY` in `.env` to the subscription's `securityKey`, as-is.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/bill-com` in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests cover a valid signature over BILL's test notification, a hex digest (rejected), a pretty-printed copy of the body (rejected), a `bill.created` event, another key, a tampered body, a missing header, a trailing newline in the key, invalid JSON, and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 bill-com --path /webhooks/bill-com
```

Create a sandbox subscription with the printed URL as `notificationUrl`, then send a signed test with `POST /v3/subscriptions/{subscriptionId}/test`.

## Notes

- The route uses `express.raw({ type: '*/*' })`. BILL signs the compact body it sends, so HMAC the exact raw bytes and don't put `express.json()` in front of it.
- BILL treats anything but HTTP `200` within 10 seconds as a failure. The example returns `200`.
