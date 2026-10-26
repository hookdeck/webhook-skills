# NextPay Webhooks - Next.js Example

Minimal example of receiving NextPay webhooks in the Next.js App Router with signature
verification using the official [`svix`](https://www.npmjs.com/package/svix) library
(NextPay delivers webhooks through Svix).

## Prerequisites

- Node.js 18+
- A NextPay webhook registered via `POST /v2/webhooks` and its signing secret (`whsec_...`), shown once in the response

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your NextPay signing secret to `.env.local` as `NEXTPAY_WEBHOOK_SECRET`. It is the
   `secret` returned by `POST /v2/webhooks`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/nextpay
```

## Test

```bash
npm test
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`), including deliveries that carry the `webhook-*`
header names instead of `svix-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 nextpay --path /webhooks/nextpay
```

1. Register the tunnel URL with `POST /v2/webhooks` and the `events` you want, e.g.
   `["v2.payment_intent.succeeded", "payout_request.processed", "payout.failed"]`.
2. Copy the returned `secret` into `.env.local`.

## Event Handling

The route reads the event name as `event.event || event.type` (`v2.*` events are
`{event, payload}`, payout and platform events are `{type, data}`), routes these events, and
acknowledges anything else with `200`:

- `v2.payment_intent.succeeded`, `v2.payment_intent.canceled`, `v2.payment_instrument.used`, `v2.payment_instrument.payment_received`, `v2.payment_instrument.payment_settled` (body: `event` + `payload`)
- `payout_request.creation_failed`, `payout_request.queued`, `payout_request.queue_failed`, `payout_request.processed`
- `payout.succeeded`, `payout.failed`, `payout.processed`, `payout.processing_failed`
- `deposit.confirmed`, `direct_transfer.received`, `legal_entity.verification_status_changed` (body: `type` + `data`)
