# Dots Webhooks - Next.js Example

Minimal example of receiving Dots webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Dots delivers webhooks through Svix).

## Prerequisites

- Node.js 18+
- Dots account with a webhook endpoint (added in the Svix dashboard) and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your endpoint's signing secret to `.env` as `DOTS_WEBHOOK_SECRET`.
   Dots' own docs don't show the secret, so the `whsec_` format is Svix's.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/dots
```

## Test

```bash
npm test
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{id}.{timestamp}.{raw body}`), including a delivery sent with `webhook-*` headers
instead of `svix-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 dots --path /webhooks/dots
```

1. Add the tunnel URL as an endpoint in the Svix dashboard linked from the Dots dashboard
   (API Management tab).
2. Copy the endpoint's signing secret into `.env`.
3. Trigger a flow, transfer, or payout link in your Dots app to receive events.

## Event Handling

The handler reads the event name from the body's top-level `event` field, routes these
events, and logs anything else. Payloads carry only resource ids, so fetch the resource from
the Dots API for its current state.

- `payment_intent.updated`
- `payment_method.updated`
- `flow.updated`
- `dispute.updated`
- `payout_request.updated`
- `organization.updated`
- `app.updated`
- `transfer.updated`
- `payout_link.updated`
- `user.updated`
- `user.onboarded`
- `user.onboarding_revoked`

## Header Fallback

The handler reads `svix-id`, `svix-timestamp`, and `svix-signature`, and falls back to the
Standard Webhooks `webhook-*` names when `svix-id` is absent (as Hookdeck does). It never
mixes the two sets.

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
