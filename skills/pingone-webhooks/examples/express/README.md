# PingOne Webhooks - Express Example

Minimal example of receiving PingOne subscription webhooks and authenticating them with the
header you set on the subscription.

PingOne does not sign requests, so there is no HMAC to verify. The handler reads the header named
by `PINGONE_WEBHOOK_HEADER` (default `Authorization`, case-insensitive) and compares the **whole
value** with `PINGONE_WEBHOOK_SECRET` in constant time. The route reads the body with `express.raw({ type: '*/*' })`, so any content type works. It handles both `JSON_ARRAY` and
`ND_JSON` batches of audit events.

> A static shared credential authenticates the sender, not the body, and gives no replay
> protection. Use HTTPS and rotate the header value if it leaks.

## Prerequisites

- Node.js 18+
- A PingOne subscription with an authentication header (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Paste the exact header value you set on the subscription into `PINGONE_WEBHOOK_SECRET`
   (including any `Bearer ` prefix), and set `PINGONE_WEBHOOK_HEADER` to the header name.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/pingone`.

## Test

```bash
npm test
```

The tests send `JSON_ARRAY` and `ND_JSON` bodies with correct, wrong and missing header values.
No PingOne account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/pingone \
  -H "Content-Type: application/json" \
  -H "Authorization: $PINGONE_WEBHOOK_SECRET" \
  -d '[{"id":"evt-1","action":{"type":"USER.CREATED"},"actors":{"user":{"name":"jane"}}}]'
```

## Receive Webhooks Locally

PingOne can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 pingone --path /webhooks/pingone
```

Use the printed URL as the subscription's `httpEndpoint.url`.

## How It Works

- `src/index.js`: `verifyPingOneRequest()`, `parseEvents()` and the `POST /webhooks/pingone` route

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON array or ND_JSON of event objects (`400` otherwise).
3. Each event is dispatched on `action.type`: `USER.CREATED`, `USER.UPDATED`, `USER.DELETED`,
   `AUTHENTICATION.CREATED`, `PASSWORD.RESET`.
4. It returns `200 {"received": <count>}`. Return `200` only once the batch is handled: PingOne
   retries the current event until it gets one.
