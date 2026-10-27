# Junction Webhooks - Next.js Example

Minimal example of receiving Junction webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Junction delivers webhooks through Svix).

## Prerequisites

- Node.js 18+
- Junction account with a webhook endpoint and its signing secret (expected to start with `whsec_`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Junction signing secret to `.env` as `JUNCTION_WEBHOOK_SECRET`. You'll find it under
   Webhooks > the endpoint > Signing Secret in the Junction dashboard.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/junction
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
npx hookdeck-cli listen 3000 junction --path /webhooks/junction
```

1. Register the tunnel URL as a webhook endpoint in the Junction dashboard.
2. Copy the endpoint's signing secret into `.env`.
3. Connect a provider to a test user to trigger `provider.connection.created`.

## Event Handling

The handler reads the event name from the body's top-level `event_type` field, routes these
events, and acknowledges anything else with `200`:

- `provider.connection.created`, `provider.connection.error`
- `provider.device.created`, `provider.device.updated`
- `daily.data.{resource}.created` and `daily.data.{resource}.updated` (for example `daily.data.sleep.created`, `daily.data.steps.updated`)
- `historical.data.{resource}.created` (for example `historical.data.workouts.created`)
- `labtest.order.created`, `labtest.order.updated`
- `labtest.appointment.created`, `labtest.appointment.updated`
- `labtest.result.critical`
- `continuous_query.result_table.changed`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
