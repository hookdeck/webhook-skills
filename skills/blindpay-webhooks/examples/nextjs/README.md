# BlindPay Webhooks - Next.js Example

Minimal example of receiving BlindPay webhooks in the Next.js App Router with signature
verification using the official [`svix`](https://www.npmjs.com/package/svix) library
(BlindPay delivers webhooks through Svix).

## Prerequisites

- Node.js 18+
- A BlindPay instance with a webhook endpoint and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your BlindPay webhook secret to `.env.local` as `BLINDPAY_WEBHOOK_SECRET` (the full
   `whsec_...` value from the endpoint's **Get secret** menu item or the `/secret` API).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/blindpay
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
npx hookdeck-cli listen 3000 blindpay --path /webhooks/blindpay
```

1. In the [BlindPay dashboard](https://app.blindpay.com), open your instance's **Webhooks** tab
   (or `POST /v1/instances/{instance}/webhook-endpoints`) and add the tunnel URL as an endpoint.
2. Copy the webhook secret into `.env.local`.

## Event Handling

The body is flat: `webhook_event` holds the event name, followed by the resource's own fields.
The route routes on `webhook_event` and acknowledges anything else with `200`:

- `customer.new`, `customer.update`, `customer.delete`
- `bankAccount.new`, `blockchainWallet.new`, `blockchainWallet.update`, `tos.accept`
- `payin.new`, `payin.update`, `payin.complete`
- `payout.new`, `payout.update`, `payout.complete`
- `virtualAccount.new`, `virtualAccount.complete`
- `transfer.new`, `transfer.update`, `transfer.complete`
- `wallet.new`, `wallet.update`, `wallet.inbound`
- `limitIncrease.new`, `limitIncrease.update`
- `payable.new`, `payable.update`, `payable.complete`

`svix-id` is stable across retries and replays, so deduplicate on it before acting twice.

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
