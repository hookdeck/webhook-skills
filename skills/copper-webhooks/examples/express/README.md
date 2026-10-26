# Copper Webhooks - Express Example

Minimal example of receiving Copper webhooks and authenticating them with a secret header.

Copper does not sign payloads, so there is no HMAC to verify. When you create a subscription you
add a secret to its `headers` object; the handler compares that header with your stored value in
constant time. The header name comes from `COPPER_WEBHOOK_HEADER` (default `X-Webhook-Secret`)
and the whole header value is compared with `COPPER_WEBHOOK_SECRET` (no `Bearer ` parsing). The
route reads the body raw, so any content type works.

A static shared credential authenticates the sender, not the body, and gives no replay
protection: use HTTPS and rotate the secret if it leaks.

## Prerequisites

- Node.js 20+
- A Copper account with API access (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `COPPER_WEBHOOK_SECRET` to the exact header value you pass in the subscription's `headers`
   object, and `COPPER_WEBHOOK_HEADER` to its name.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/copper`.

## Test

```bash
npm test
```

The tests cover every `type` and `event` with correct, wrong and missing secrets. No Copper
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/copper \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $COPPER_WEBHOOK_SECRET" \
  -d '{"ids":[1],"type":"person","event":"new","subscription_id":1,"updated_attributes":{},"timestamp":"2021-12-13T19:18:22.084Z"}'
```

## Receive Webhooks Locally

Copper can't reach `localhost` and only accepts `https://` targets. Tunnel to your machine with
the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 copper --path /webhooks/copper
```

Use the printed URL as the subscription's `target`.

## How It Works

- `src/index.js`: `verifyCopperRequest()` plus the `POST /webhooks/copper` route

1. The secret header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object with `ids`, `type` and `event` (`400` otherwise).
3. The handler dispatches on `type` + `event`: `lead`, `person`, `company`, `opportunity`,
   `project`, `task` or `activity_log`, each with `new`, `update` or `delete`.
4. It returns `200 {"received": true}`.

The subscription's optional `secret` key/value pairs are merged into the top level of the body; this example does not rely on them.
