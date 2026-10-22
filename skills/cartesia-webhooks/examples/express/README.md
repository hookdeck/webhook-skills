# Cartesia Webhooks - Express Example

Minimal example of receiving Cartesia (Line voice agent) webhooks with Express.

Cartesia does not sign the payload. It sends the secret you set on the webhook, unchanged,
in the `x-webhook-secret` header. The handler compares it to `CARTESIA_WEBHOOK_SECRET` with a
constant-time comparison.

## Prerequisites

- Node.js 18+
- A Cartesia account with an agent and a webhook (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CARTESIA_WEBHOOK_SECRET` to the same value you entered as the webhook's secret in
   Cartesia (`openssl rand -hex 32` makes a good one).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts events at `POST /webhooks/cartesia`.

## Test

```bash
npm test
```

The tests cover correct, wrong and missing secrets, every documented event type, and
duplicate delivery. No Cartesia account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/cartesia \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $CARTESIA_WEBHOOK_SECRET" \
  -d '{"type":"call_started","call_id":"ac_test_123","agent_id":"agent_demo","webhook_id":"agent_webhook_test","webhook_request_id":"webhook_req_test_123","timestamp":"2026-01-01T00:00:00Z"}'
```

## Receive Webhooks from Cartesia Locally

Cartesia needs a public `https` URL. Tunnel to your machine with the Hookdeck CLI (no
account, no install):

```bash
npx hookdeck-cli listen 3000 cartesia --path /webhooks/cartesia
```

Use the printed URL as the webhook URL in Cartesia.

## How It Works

- `src/index.js`: `verifyCartesiaRequest()` plus the `POST /webhooks/cartesia` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type reaches the
   handler and nothing is parsed before authentication.
2. `x-webhook-secret` is compared to `CARTESIA_WEBHOOK_SECRET` in constant time. Failure
   returns `401`, which Cartesia treats as permanent (no retry).
3. The body must be a JSON object (`400` otherwise).
4. Events with an already-seen `webhook_request_id` are acknowledged without reprocessing.
5. The handler dispatches on `type`: `call_started`, `call_completed`, `call_failed`,
   `call_turn`, `post_call_analysis`, then returns `200 {"received": true}`.
