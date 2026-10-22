# Railway Webhooks - Express Example

Minimal example of receiving Railway webhooks and authenticating them with a secret custom header.

Railway does not sign payloads, so there is no HMAC to verify. You add a custom header (name and
value) in **Project Settings > Webhooks**; the handler reads the header name from
`RAILWAY_WEBHOOK_HEADER` (default `Authorization`) and compares the **whole** header value with
`RAILWAY_WEBHOOK_SECRET` in constant time. The route reads the body with `express.raw({ type: '*/*' })`, so any content type works.

> A static shared credential authenticates the sender, not the body, and gives no replay
> protection (no signature, no timestamp). Use HTTPS and rotate the value if it leaks.

## Prerequisites

- Node.js 18+
- A Railway project (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `RAILWAY_WEBHOOK_HEADER` to the custom header name you added in Railway and
   `RAILWAY_WEBHOOK_SECRET` to its exact full value (including any `Bearer ` prefix).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/railway`.

## Test

```bash
npm test
```

The tests cover correct, wrong, missing and wrong-length header values, the `Bearer ` prefix,
any content type, and `Deployment.failed`. No Railway account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/railway \
  -H "Content-Type: application/json" \
  -H "$RAILWAY_WEBHOOK_HEADER: $RAILWAY_WEBHOOK_SECRET" \
  -d '{"type":"Deployment.failed","details":{"id":"1"},"resource":{"service":{"name":"web"}},"severity":"WARNING","timestamp":"2025-11-21T23:48:42.311Z"}'
```

## Receive Webhooks Locally

Railway can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 railway --path /webhooks/railway
```

Put the printed URL in Railway's webhook form and add the same custom header there.

## How It Works

- `src/index.js`: `verifyRailwayRequest()` plus the `POST /webhooks/railway` route

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `type`: `Deployment.failed` explicitly, other `Deployment.<state>`
   types by prefix; anything else (such as alerts) is logged and acknowledged.
4. It returns `200 {"received": true}`.
