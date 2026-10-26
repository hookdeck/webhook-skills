# Streak Webhooks - Next.js Example

Minimal example of receiving Streak webhooks with the Next.js App Router and authenticating them
with the `X-Streak-Webhook-Token` header.

Streak does not sign payloads. If the webhook was created with a `token`, Streak sends it as plain
text in `X-Streak-Webhook-Token`; the route compares the whole header value with your token in
constant time (`lib/verify-streak.ts`). **Webhooks created without a token send nothing to
verify.** The body is read as text, so any content type works.

A static token authenticates the sender, not the body, and gives no replay protection. Use HTTPS
and rotate the token if it leaks.

## Prerequisites

- Node.js 18+
- A Streak webhook created through the API with a `token` (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `STREAK_WEBHOOK_TOKEN` to the `token` you passed when creating the webhook.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/streak`.

## Test

```bash
npm test
```

To try it by hand:

```bash
curl -X POST "http://localhost:3000/webhooks/streak?event=BOX_CREATE" \
  -H "Content-Type: application/json" \
  -H "X-Streak-Webhook-Token: $STREAK_WEBHOOK_TOKEN" \
  -d '[{"key":"gICIxYzv9QoM","pipelineKey":"agxzfm1hZaXCgw","name":"Acme deal"}]'
```

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 streak --path /webhooks/streak
```

Use the printed URL (plus `?event=BOX_CREATE`) as `targetUrl` when you create the webhook.

## How It Works

- `lib/verify-streak.ts`: `verifyStreakRequest()`
- `app/webhooks/streak/route.ts`: the route

The token is checked first (`401` on failure), then the body must be a JSON object or array of
objects (`400`). The event name is not in the body, so the route dispatches on the `?event=`
query parameter of each webhook's `targetUrl`. It returns `200 {"received": true}`; `410 Gone`
would make Streak delete the webhook, and any other non-200 response is retried.
