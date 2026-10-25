# ClickHouse (ClickStack) Webhooks - Next.js Example

Minimal App Router example of receiving ClickStack alert webhooks and authenticating them with
the secret header you configured. Covers ClickStack alert webhooks of type Generic only.

ClickStack does not sign payloads. The route compares one header (name from
`CLICKHOUSE_WEBHOOK_HEADER`, default `Authorization`) with `CLICKHOUSE_WEBHOOK_SECRET`: the exact,
whole value, in constant time. A static credential authenticates the sender, not the body, and
gives no replay protection, so use HTTPS and rotate it if it leaks.

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
   cp .env.example .env.local
   ```

3. Set `CLICKHOUSE_WEBHOOK_HEADER` and `CLICKHOUSE_WEBHOOK_SECRET` to match the header you added
   under **Webhook headers**.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/clickhouse`.

## Test

```bash
npm test
```

The tests send an illustrative payload with correct, wrong and missing headers.

## Receive Webhooks Locally

ClickStack can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 clickhouse --path /webhooks/clickhouse
```

Put the printed URL in the ClickStack webhook.

## How It Works

- `lib/verify-clickhouse.ts`: `verifyClickHouseRequest()`
- `app/webhooks/clickhouse/route.ts`: the `POST` handler

1. The secret header is checked before the body is read. Failure returns `401`.
2. The body is read as text (any content type), parsed as JSON if it is an object, otherwise
   treated as plain text.
3. The handler logs the `{{title}}`, `{{body}}` and `{{link}}` fields of the illustrative template.
   ClickHouse documents no event names.
4. It returns `200 {"received": true}`.
