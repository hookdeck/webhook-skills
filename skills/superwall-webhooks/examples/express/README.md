# Superwall Webhooks - Express Example

Minimal example of receiving Superwall webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Superwall delivers through Svix, which signs per Standard Webhooks with `svix-*` headers).

## Prerequisites

- Node.js 18+
- Superwall app with revenue tracking set up, and a webhook with its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Superwall signing secret to `.env` as `SUPERWALL_WEBHOOK_SECRET`. You'll find it on
   the Superwall dashboard (Integrations > Webhooks). V2 shows it once, right after you create the webhook; if you lose it, use **Rotate secret**.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/superwall
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
npx hookdeck-cli listen 3000 superwall --path /webhooks/superwall
```

1. Create a webhook in the Superwall dashboard (Integrations > Webhooks) with the tunnel URL.
2. Copy the signing secret into `.env`.
3. Superwall sends no test events to V2 webhooks, so make a sandbox purchase (TestFlight sandbox Apple ID, a Google Play license tester, or Stripe test mode) to trigger an `initial_purchase`.

## Event Handling

The handler reads the event name from the body's top-level `type` field (lowercase, the same in
V2 and legacy bodies), tells the two formats apart by the `superwall_version` header (`2` or `1`,
falling back to the body shape), routes these events, and acknowledges anything else with `200`:

- `initial_purchase`, `renewal`, `non_renewing_purchase`, `product_change`
- `cancellation`, `uncancellation`, `refund`
- `billing_issue`, `subscription_paused`, `subscription_extended`
- `expiration`, `transferred`

V2 facts are in `event_data` (snake_case) with the event id in `id`; legacy facts are in `data`
(camelCase) with the id in `data.id`.

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
