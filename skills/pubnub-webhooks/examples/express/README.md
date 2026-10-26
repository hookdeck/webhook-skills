# PubNub Webhooks - Express Example

Minimal example of receiving PubNub Events & Actions webhooks and authenticating them with a
secret header.

PubNub does not sign webhooks, so there is no HMAC to verify. You add a secret custom header to
the Webhook action, and the handler compares that header's **whole value** with
`PUBNUB_WEBHOOK_SECRET` using a constant-time comparison. A static shared credential
authenticates the sender, not the body, and gives no replay protection: use HTTPS and rotate the
secret if it leaks. The route reads the body with `express.raw({ type: '*/*' })`, so any content type works.

## Prerequisites

- Node.js 18+
- A PubNub keyset with an Events & Actions Webhook action (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set the two variables in `.env`:
   - `PUBNUB_WEBHOOK_HEADER`: the name of the custom header you added to the action (default `Authorization`)
   - `PUBNUB_WEBHOOK_SECRET`: the exact value of that header, including any prefix you typed such as `Bearer `

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/pubnub`.

## Test

```bash
npm test
```

The tests send every documented event type with correct, wrong and missing header values. No
PubNub account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/pubnub \
  -H "Content-Type: application/json" \
  -H "Authorization: $PUBNUB_WEBHOOK_SECRET" \
  -d '{"dataSchema":"pubnub.com/schemas/events/user.created?v=1.0.0","data":[{"userId":"user-1","name":"User One"}]}'
```

## Receive Webhooks Locally

PubNub can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 pubnub --path /webhooks/pubnub
```

Put the printed URL in the Webhook action's endpoint field.

## How It Works

- `src/index.js`: `verifyPubNubRequest()`, `eventTypeFromSchema()` and the `POST /webhooks/pubnub` route

1. The secret header is checked before the body is parsed. Failure returns `401`.
2. The body must be a **No Envelope** payload: a JSON object with `dataSchema` and a `data` array (`400` otherwise).
3. The event type is `dataSchema` without the `pubnub.com/schemas/events/` prefix and the `?v=...` suffix, for example `messages.pubsub.publish`, `user.created` or `presence.user.channel.joined`.
4. The handler runs once per item in `data` and returns `200 {"received": true}`.

Turn **Is Enveloped** off on the action. Enveloped payloads (V1, V2, V2.1) use a different layout.
