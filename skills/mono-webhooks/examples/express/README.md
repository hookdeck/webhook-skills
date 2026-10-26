# Mono Webhooks - Express Example

Minimal example of receiving Mono webhooks and authenticating them with the
`mono-webhook-secret` header.

Mono does not sign payloads, so there is no HMAC to verify. The handler compares the whole
`mono-webhook-secret` header with your app's webhook secret using a constant-time comparison.
A static shared credential authenticates the sender, not the body, and gives no replay
protection, so use HTTPS, rotate the secret if it leaks, and dedupe on `event_id` (the example
does, in memory). The route reads the body with `express.raw({ type: '*/*' })`, so any content
type works.

## Prerequisites

- Node.js 18+
- A Mono app with a webhook URL (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Use the webhook secret from your app in the Mono dashboard as `MONO_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/mono`.

## Test

```bash
npm test
```

The tests send every documented event with correct, wrong and missing secrets. No Mono
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/mono \
  -H "Content-Type: application/json" \
  -H "mono-webhook-secret: $MONO_WEBHOOK_SECRET" \
  -d '{"event":"mono.events.account_connected","event_id":"evt_test_1","timestamp":"2026-01-27T21:00:39.588Z","data":{"id":"acc_1"}}'
```

## Receive Webhooks Locally

Mono can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 mono --path /webhooks/mono
```

Put the printed URL in your app's webhook settings in the Mono dashboard.

## How It Works

- `src/index.js`: `verifyMonoRequest()` plus the `POST /webhooks/mono` route

1. The `mono-webhook-secret` header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. Retries with an already-handled `event_id` are acknowledged without reprocessing.
4. The handler dispatches on the `event` field: `mono.events.account_connected`,
   `mono.events.account_updated`, `mono.events.account_unlinked`,
   `direct_debit.payment_successful`, `direct_debit.payment_failed`,
   `direct_debit.payment_cancelled`, `direct_debit.payment_abandoned`.
5. It returns `200 {"received": true}`. Mono expects exactly `200 OK`.
