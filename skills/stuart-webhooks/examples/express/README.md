# Stuart Webhooks - Express Example

Minimal example of receiving Stuart webhooks and authenticating them with your webhook
authentication header.

Stuart does not sign payloads, so there is no HMAC to verify. The handler looks up the header
you configured (`STUART_WEBHOOK_HEADER`, default `X-Webhook-Secret`) case-insensitively and
compares its whole value with `STUART_WEBHOOK_SECRET` in constant time. The route reads the body
with `express.raw({ type: '*/*' })`, so any content type works, and parses JSON only after the
check.

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp): use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Stuart account with a webhook subscription (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `STUART_WEBHOOK_HEADER` and `STUART_WEBHOOK_SECRET` to the *Webhook authentication
   header* and *key* you entered in Stuart (the exact whole header value, including any `Bearer `
   prefix).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/stuart`.

## Test

```bash
npm test
```

The tests send every v3 topic with correct, wrong and missing credentials. No Stuart account is
needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/stuart \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $STUART_WEBHOOK_SECRET" \
  -d '{"version":"v3","event_id":"1","webhook_id":1,"topic":"package_created","details":{"package":{"id":"1","reference":"r1"}}}'
```

## Receive Webhooks Locally

Stuart can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 stuart --path /webhooks/stuart
```

Put the printed URL in your Stuart webhook subscription.

## How It Works

- `src/index.js`: `verifyStuartRequest()` plus the `POST /webhooks/stuart` route

1. The authentication header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `topic`: `package_created`, `courier_assigned`, `courier_arriving`,
   `package_split`, `courier_waiting`, `package_delivering`, `package_delivered`,
   `package_canceled`, `package_returning`, `package_returned`, `courier_reassigning`,
   `courier_moving`.
4. It returns `200 {"received": true}`.
