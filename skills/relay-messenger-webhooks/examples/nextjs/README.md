# Relay Webhooks - Next.js Example

Minimal Next.js App Router example of receiving [Relay](https://docs.relayapp.im/) (a messenger for chatting with AI agents) webhooks with signature verification. Relay signs deliveries with [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks), so the route verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. If `webhook-id` is absent it falls back to the `svix-*` headers, as Hookdeck does.

## Prerequisites

- Node.js 18+
- A Relay Agent Token and a webhook subscription
- The subscription's signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put the subscription's `signing_secret` in `RELAY_MESSENGER_WEBHOOK_SECRET`, including the `whsec_` prefix. Relay returns it once, as `signing_secret` when you create the subscription (see [setup](../../references/setup.md)). 

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/relay-messenger` ([app/webhooks/relay-messenger/route.ts](app/webhooks/relay-messenger/route.ts)).

## Test

```bash
npm test
```

The tests call the route handler directly with signatures made the way Relay makes them. They cover tampered bodies, stale timestamps, multiple signatures, the `svix-*` header fallback, another subscription's secret, duplicate `event_id`s, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 relay-messenger --path /webhooks/relay-messenger
```

Create a subscription whose `target_url` is the URL the CLI prints, with `subscribed_events` such as `message.received` and `message.sent`, then message your agent in Relay.

## Notes

- The handler reads `await request.text()`. The signature covers the exact raw body, so calling `request.json()` before verification breaks it.
- If `RELAY_MESSENGER_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The `standardwebhooks` library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones fail. Use the manual verifier in [references/verification.md](../../references/verification.md) to drop or widen the window.
- Delivery is at-least-once. The handler dedupes on the body's `event_id`, which is the same on every retry.
- Relay waits **10 seconds** per attempt. Enqueue the event and process it asynchronously in production.
