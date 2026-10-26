# Rebrandly Webhooks - Express Example

Minimal example of receiving Rebrandly webhooks (Clickstream click batches) and authenticating
them with a shared header.

Rebrandly webhooks are not signed. The handler reads the header named by
`REBRANDLY_WEBHOOK_HEADER` (default `Authorization`) and compares its whole value with
`REBRANDLY_WEBHOOK_SECRET` in constant time. It accepts GET, POST, PUT, PATCH and DELETE, reads
the body with `express.raw({ type: '*/*' })`, and parses it only after the check.

## Prerequisites

- Node.js 18+
- A Rebrandly Clickstream webhook or account webhook with an authentication header

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `REBRANDLY_WEBHOOK_HEADER` to the header name you gave Rebrandly and
   `REBRANDLY_WEBHOOK_SECRET` to its exact value (including any `Bearer ` prefix).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts any method at `/webhooks/rebrandly`.

## Test

```bash
npm test
```

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/rebrandly \
  -H "Content-Type: application/json" \
  -H "Authorization: $REBRANDLY_WEBHOOK_SECRET" \
  -d '{"data":[{"timestamp":"2019-07-02T14:07:06.981094Z","route":{"id":"a1ec86bf91bfe763ad02f602259ea0a9"}}],"key":"abcxyz123"}'
```

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 rebrandly --path /webhooks/rebrandly
```

## How It Works

1. The credential header is checked first, for every method. Failure returns `401`.
2. An empty body returns `200`.
3. The body is parsed as JSON (`400` if invalid) and each click in `data[]` is handled.
4. Returns `200 {"received": true, "clicks": n}`.
