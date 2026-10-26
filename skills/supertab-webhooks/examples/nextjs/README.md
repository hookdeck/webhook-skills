# Supertab Webhooks - Next.js Example

Minimal example of receiving Supertab webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Supertab delivers webhooks through Svix: Standard Webhooks signatures with `svix-*` headers).

## Prerequisites

- Node.js 18+
- Supertab merchant account with a webhook endpoint (Business Portal > Webhooks) and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Supertab signing secret to `.env` as `SUPERTAB_WEBHOOK_SECRET`. You'll find it
   on the endpoint you created under Webhooks in the Supertab Business Portal.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/supertab
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
npx hookdeck-cli listen 3000 supertab --path /webhooks/supertab
```

1. In the Supertab Business Portal, open Webhooks, click **Add Endpoint**, and register the tunnel URL.
2. Copy the endpoint's signing secret into `.env`.
3. Make a test purchase (or send a test event from the endpoint's page) to deliver `purchase.completed_2025-04-01`.

## Event Handling

The handler reads the event name from the body's top-level `type` field. The name carries a version
suffix (`_2025-04-01`), so the handler strips it and also accepts the unversioned `purchase.completed`
that appears in the catalog's own example. It routes these events and acknowledges anything else
with `200`:

- `purchase.completed_2025-04-01`
- `onetime_offering.purchasing_completed_2025-04-01`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
