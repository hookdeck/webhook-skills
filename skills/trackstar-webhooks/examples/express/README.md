# Trackstar Webhooks - Express Example

Minimal example of receiving Trackstar webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Trackstar delivers webhooks through Svix).

## Prerequisites

- Node.js 18+
- Trackstar account with a webhook endpoint and its signing secret (`whsec_...`)

> Trackstar's webhook portal is a Svix portal, so every delivery is signed. Requests without
> signature headers are rejected with a 400.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Trackstar signing secret to `.env` as `TRACKSTAR_WEBHOOK_SECRET`. You'll find it on
   the endpoint's page in the [Trackstar dashboard](https://dashboard.trackstarhq.com/webhooks) (Webhooks).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/trackstar
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
npx hookdeck-cli listen 3000 trackstar --path /webhooks/trackstar
```

1. Register the tunnel URL as a webhook endpoint in the Trackstar dashboard.
2. Copy the endpoint's signing secret into `.env`.
3. Connect a sandbox integration to trigger `connection.created`.

## Event Handling

The handler reads the event name from the body's top-level `event_type` field, routes these
events, and acknowledges anything else with `200`:

- `connection.created`, `connection.deleted`, `connection.historical-sync-completed`, `connection.sync-job-stuck`
- `connection-error.created`, `install.failed`
- `order.created`, `order.updated`, `order.shipment.created`
- `inventory.updated`
- `inbound-shipment.updated`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
