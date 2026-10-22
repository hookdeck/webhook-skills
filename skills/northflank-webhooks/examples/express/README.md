# Northflank Webhooks - Express Example

Minimal example of receiving Northflank **webhook notification integration** requests,
authenticated with the integration's secret.

Northflank does not sign the payload. It sends the secret you set on the integration, unchanged,
in the `X-Northflank-Notification-Integration-Token` header. The handler compares it with your
`NORTHFLANK_WEBHOOK_SECRET` using a constant-time comparison.

## Prerequisites

- Node.js 18+
- A Northflank account with a webhook notification integration (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `NORTHFLANK_WEBHOOK_SECRET` to a long random value (`openssl rand -hex 32`) and enter
   the same value in the **Secret** field of the Northflank webhook integration. The secret is
   optional in Northflank, but set one: without it anyone can post to your endpoint.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/northflank`.

## Test

```bash
npm test
```

The tests send requests with a correct, wrong and missing token and check the event dispatch.
No Northflank account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/northflank \
  -H "Content-Type: application/json" \
  -H "X-Northflank-Notification-Integration-Token: $NORTHFLANK_WEBHOOK_SECRET" \
  -d '{"event":"build:start","data":{"build":{"id":"social-hour-1312"},"service":{"id":"website"},"project":{"id":"personal-blog"}}}'
```

## Receive Webhooks Locally

Northflank can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 northflank --path /webhooks/northflank
```

Use the printed URL as the webhook URL of the Northflank notification integration.

## How It Works

- `src/index.js`: `verifyNorthflankRequest()` plus the `POST /webhooks/northflank` route

1. The route reads the body with `express.raw({ type: '*/*' })`, so any content type reaches
   the handler as a Buffer and nothing is parsed before the token is checked.
2. A missing or wrong `X-Northflank-Notification-Integration-Token` returns `401`.
3. The body must be a JSON object (`400` otherwise).
4. The handler dispatches on the `event` field (`build:start`, `build:success`, `build:failure`,
   `service:deployment:status-update`, `job-run:failure`, `addon-backup:success`,
   `addon-backup:failure`, `billing:invoice-payment-failed`).
5. It returns `200`. Northflank resends notifications that don't get a `2xx` and disables
   webhooks that keep failing.
