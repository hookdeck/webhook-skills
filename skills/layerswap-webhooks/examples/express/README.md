# Layerswap Webhooks - Express Example

Minimal example of receiving Layerswap webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Layerswap delivers webhooks through Svix).

## Prerequisites

- Node.js 18+
- A Layerswap Partner Dashboard app with a webhook and its secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Layerswap webhook secret to `.env` as `LAYERSWAP_WEBHOOK_SECRET` (the full
   `whsec_...` value from the Partner Dashboard's Webhooks section).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/layerswap
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
npx hookdeck-cli listen 3000 layerswap --path /webhooks/layerswap
```

1. In the [Partner Dashboard](https://layerswap.io/dashboard), open your app's **Webhooks**
   section, add the tunnel URL as an endpoint and create the webhook.
2. Copy the webhook secret into `.env`.

## Event Handling

The body is `{ swap, quote, deposit_actions }` and has **no event-type field**. The handler
routes on `swap.status` and acknowledges anything else with `200`:

- `user_transfer_pending`, `ls_transfer_pending`
- `completed`, `failed`, `expired`
- `pending_refund`, `refunded`

Layerswap documents no retry schedule or ordering, so deduplicate on `swap.id` plus `status`
and fetch `GET /swaps/{id}` before irreversible actions.

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
