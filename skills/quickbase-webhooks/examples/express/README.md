# Quickbase Webhooks - Express Example

Minimal example of receiving Quickbase table webhooks and authenticating them with a secret header.

Quickbase does not sign webhooks. You add a secret header in the webhook's **Message header** list,
and the handler compares it with `QUICKBASE_WEBHOOK_SECRET`: the exact, whole header value (any
`Bearer ` prefix included, never stripped) in constant time. The header name comes from
`QUICKBASE_WEBHOOK_HEADER` (default `Authorization`). A static credential authenticates the sender,
not the body, and gives no replay protection, so use HTTPS and rotate it if it leaks.

The route accepts POST, PUT, PATCH, GET and DELETE, reads the body with
`express.raw({ type: '*/*' })` (XML, JSON, RAW or empty), and parses it only after the check.

## Prerequisites

- Node.js 18+
- A Quickbase app where you can create table webhooks (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `QUICKBASE_WEBHOOK_SECRET` (and `QUICKBASE_WEBHOOK_HEADER` if not `Authorization`) to match
   the header you add in the Quickbase webhook.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `/webhooks/quickbase`.

## Test

```bash
npm test
```

The tests cover correct, wrong, missing and prefix-stripped secrets, every method, and JSON, XML,
RAW and empty bodies. No Quickbase account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/quickbase \
  -H "Content-Type: application/json" \
  -H "Authorization: $QUICKBASE_WEBHOOK_SECRET" \
  -d '{"event":"record_added","record_id":42,"table":"Projects"}'
```

## Receive Webhooks Locally

Quickbase can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 quickbase --path /webhooks/quickbase
```

Put the printed URL in the webhook's **Endpoint URL**.

## How It Works

- `src/index.js`: `verifyQuickbaseRequest()` plus the `/webhooks/quickbase` route

1. The secret header is checked before the body is parsed. Failure returns `401`.
2. The body (if any) is parsed as JSON when possible; XML, RAW text and empty bodies are accepted.
3. The `event` field is **illustrative**: Quickbase adds no event field, so it is a literal you put
   in your own message body template. The handler recognizes `record_added`, `record_modified` and
   `record_deleted` and acknowledges anything else.
4. It returns `200 {"received": true}`.
