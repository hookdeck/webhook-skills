# 100ms Webhooks - Express Example

Minimal example of receiving 100ms webhooks and authenticating them with a secret header.

100ms webhooks are not signed, so there is no HMAC to verify. You add a secret header to the
webhook in the 100ms dashboard, and the handler compares that header's whole value with
`HUNDRED_MS_WEBHOOK_SECRET` in constant time. The route reads the body with
`express.raw({ type: '*/*' })`, so any content type works.

## Prerequisites

- Node.js 18+
- A 100ms account with a webhook configured (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `HUNDRED_MS_WEBHOOK_HEADER` to the header name you chose in the 100ms dashboard (default
   `Authorization`) and `HUNDRED_MS_WEBHOOK_SECRET` to its exact, whole value (including any
   `Bearer ` prefix you typed).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/100ms`.

## Test

```bash
npm test
```

The tests send every documented event with correct, wrong and missing header values. No 100ms
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/100ms \
  -H "Content-Type: application/json" \
  -H "Authorization: $HUNDRED_MS_WEBHOOK_SECRET" \
  -d '{"version":"2.0","id":"6c75de35-b778-4fb0-88ae-114c28dc285f","type":"peer.join.success","data":{"peer_id":"83b869e1","role":"host","user_name":"test user"}}'
```

## Receive Webhooks Locally

100ms can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 100ms --path /webhooks/100ms
```

Put the printed URL in the 100ms dashboard webhook configuration.

## How It Works

- `src/index.js`: `verify100msRequest()` plus the `POST /webhooks/100ms` route

1. The secret header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object with a `type` (`400` otherwise).
3. Repeated `id`s (100ms retries three times on any non-200) are acknowledged without reprocessing.
4. The handler dispatches on `type`, e.g. `peer.join.success`, `session.close.success`,
   `recording.success`, `hls.started.success`.
5. It returns `200 {"received": true}`.

A static shared header authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the secret if it leaks.
