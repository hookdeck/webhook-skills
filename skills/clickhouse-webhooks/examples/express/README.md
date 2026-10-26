# ClickHouse (ClickStack) Webhooks - Express Example

Minimal example of receiving ClickStack alert webhooks and authenticating them with the secret
header you configured. Covers ClickStack alert webhooks of type Generic only.

ClickStack does not sign payloads. The handler compares one header (name from
`CLICKHOUSE_WEBHOOK_HEADER`, default `Authorization`) with `CLICKHOUSE_WEBHOOK_SECRET`: the exact,
whole value, in constant time. A static credential authenticates the sender, not the body, and
gives no replay protection, so use HTTPS and rotate it if it leaks. The route reads the body with
`express.raw({ type: '*/*' })`, so any content type works.

## Prerequisites

- Node.js 18+
- A ClickStack Generic webhook with a secret header (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CLICKHOUSE_WEBHOOK_HEADER` and `CLICKHOUSE_WEBHOOK_SECRET` to match the header you added
   under **Webhook headers**.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/clickhouse`.

## Test

```bash
npm test
```

The tests send an illustrative payload with correct, wrong and missing headers. No ClickHouse
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/clickhouse \
  -H "Content-Type: application/json" \
  -H "Authorization: $CLICKHOUSE_WEBHOOK_SECRET" \
  -d '{"title":"High error rate","body":"Alert fired","link":"https://clickstack.example.com/search/abc"}'
```

## Receive Webhooks Locally

ClickStack can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 clickhouse --path /webhooks/clickhouse
```

Put the printed URL in the ClickStack webhook.

## How It Works

- `src/index.js`: `verifyClickHouseRequest()` plus the `POST /webhooks/clickhouse` route

1. The secret header is checked before the body is parsed. Failure returns `401`.
2. The body is parsed as JSON if it is an object, otherwise treated as plain text.
3. The handler logs the `{{title}}`, `{{body}}` and `{{link}}` fields of the illustrative template.
   ClickHouse documents no event names.
4. It returns `200 {"received": true}`.
