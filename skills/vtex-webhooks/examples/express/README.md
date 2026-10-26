# VTEX Webhooks - Express Example

Minimal example of receiving VTEX Orders API hook webhooks and authenticating them with a secret
header.

VTEX does not sign hooks. You add a secret header in the hook configuration's `headers` object and
the handler compares it, in full and in constant time, with `VTEX_WEBHOOK_SECRET`. The header name is
yours to choose (`VTEX_WEBHOOK_HEADER`, default `X-Webhook-Secret`). A static shared credential
authenticates the sender, not the body, and gives no replay protection, so use HTTPS and rotate it if
it leaks. The route reads the body with `express.raw({ type: '*/*' })`, so any content type works.

## Prerequisites

- Node.js 18+
- A VTEX account to configure the hook (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `VTEX_WEBHOOK_HEADER` and `VTEX_WEBHOOK_SECRET` to the header name and exact value you put in
   the hook configuration.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/vtex`.

## Test

```bash
npm test
```

The tests send every handled order status with correct, wrong and missing secrets, plus the
`hookConfig` ping. No VTEX account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/vtex \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $VTEX_WEBHOOK_SECRET" \
  -d '{"Domain":"Marketplace","OrderId":"v40484048naf-01","State":"payment-approved","Origin":{"Account":"accountABC","Key":"vtexappkey-keyEDF"}}'
```

## Receive Webhooks Locally

VTEX can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 vtex --path /webhooks/vtex
```

Use the printed URL as `hook.url` in the VTEX hook configuration.

## How It Works

- `src/index.js`: `verifyVtexRequest()` plus the `POST /webhooks/vtex` route

1. `{"hookConfig": "ping"}` (sent when the hook is saved) gets `200` before the auth check.
2. The secret header is checked before the body is used. Failure returns `401`.
3. The body must be a JSON object (`400` otherwise).
4. The handler dispatches on `State`: `order-created`, `on-order-completed`, `payment-pending`,
   `payment-approved`, `waiting-ffmt-authorization`, `ready-for-handling`, `start-handling`,
   `handling`, `invoiced`, `cancel`, `canceled`.
5. It returns `200 {"received": true}`.
