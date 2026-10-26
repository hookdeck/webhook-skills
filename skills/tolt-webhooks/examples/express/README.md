# Tolt Webhooks - Express Example

Minimal example of receiving Tolt webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Tolt delivers webhooks through Svix).

## Prerequisites

- Node.js 18+
- Tolt account with a webhook endpoint and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Tolt signing secret to `.env` as `TOLT_WEBHOOK_SECRET`. You'll find it on
   the endpoint's page under Settings > Webhooks in the Tolt dashboard.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/tolt
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
npx hookdeck-cli listen 3000 tolt --path /webhooks/tolt
```

1. Register the tunnel URL as a webhook endpoint in the Tolt dashboard.
2. Copy the endpoint's signing secret into `.env`.
3. Create a partner or a referral link to trigger `partner.created` or `link.created`.

## Event Handling

The handler reads the event name from the top-level `type` field of the `{ type, data, timestamp }`
envelope, routes these events, and acknowledges anything else with `200`:

- `partner.created`, `partner.updated`
- `link.created`, `link.updated`
- `customer.created`, `customer.updated`
- `transaction.created`, `transaction.updated`
- `commission.created`, `commission.updated`

The body has no event id: deduplicate on the `svix-id` header.

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
