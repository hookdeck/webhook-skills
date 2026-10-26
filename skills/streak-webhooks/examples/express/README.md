# Streak Webhooks - Express Example

Minimal example of receiving Streak webhooks and authenticating them with the
`X-Streak-Webhook-Token` header.

Streak does not sign payloads, so there is no HMAC to verify. If the webhook was created with a
`token`, Streak sends it as plain text in `X-Streak-Webhook-Token`; the handler compares the whole
header value with your token using a constant-time comparison. **Webhooks created without a token
send nothing to verify.** The route reads the body with `express.raw({ type: '*/*' })`, so any
content type works.

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
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/streak`.

## Test

```bash
npm test
```

The tests send every documented event with correct, wrong and missing tokens. No Streak account
is needed.

To try it by hand:

```bash
curl -X POST "http://localhost:3000/webhooks/streak?event=BOX_CREATE" \
  -H "Content-Type: application/json" \
  -H "X-Streak-Webhook-Token: $STREAK_WEBHOOK_TOKEN" \
  -d '[{"key":"gICIxYzv9QoM","pipelineKey":"agxzfm1hZaXCgw","name":"Acme deal"}]'
```

## Receive Webhooks Locally

Streak can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 streak --path /webhooks/streak
```

Use the printed URL (plus `?event=BOX_CREATE`) as `targetUrl` when you create the webhook.

## How It Works

- `src/index.js`: `verifyStreakRequest()` plus the `POST /webhooks/streak` route

1. The `X-Streak-Webhook-Token` header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object or an array of objects (`400` otherwise).
3. The event name is not in the body, so the handler dispatches on the `?event=` query parameter
   you put on each webhook's `targetUrl`.
4. It returns `200 {"received": true}`. Respond `410 Gone` only if you want Streak to delete the
   webhook; any other non-200 response is retried with backoff.
