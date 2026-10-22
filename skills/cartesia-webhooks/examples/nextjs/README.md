# Cartesia Webhooks - Next.js Example

Minimal example of receiving Cartesia (Line voice agent) webhooks with the Next.js App Router.

Cartesia does not sign the payload. It sends the secret you set on the webhook, unchanged,
in the `x-webhook-secret` header. The route compares it to `CARTESIA_WEBHOOK_SECRET` with a
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
   cp .env.example .env.local
   ```

3. Set `CARTESIA_WEBHOOK_SECRET` to the same value you entered as the webhook's secret in
   Cartesia (`openssl rand -hex 32` makes a good one).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts events at `POST /webhooks/cartesia`.

## Test

```bash
npm test
```

The tests cover correct, wrong and missing secrets, every documented event type, and
duplicate delivery. No Cartesia account is needed.

## Receive Webhooks from Cartesia Locally

Cartesia needs a public `https` URL. Tunnel to your machine with the Hookdeck CLI (no
account, no install):

```bash
npx hookdeck-cli listen 3000 cartesia --path /webhooks/cartesia
```

Use the printed URL as the webhook URL in Cartesia.

## How It Works

- `lib/verify-cartesia.ts`: `verifyCartesiaRequest()`, a constant-time header check
- `app/webhooks/cartesia/route.ts`: the `POST` handler

1. `x-webhook-secret` is checked before the body is read. Failure returns `401`, which
   Cartesia treats as permanent (no retry).
2. The body must be a JSON object (`400` otherwise).
3. Events with an already-seen `webhook_request_id` are acknowledged without reprocessing.
4. The handler dispatches on `type`: `call_started`, `call_completed`, `call_failed`,
   `call_turn`, `post_call_analysis`, then returns `200 {"received": true}`.
