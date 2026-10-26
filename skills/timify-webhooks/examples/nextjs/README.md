# TIMIFY Webhooks - Next.js Example

Minimal example of receiving TIMIFY webhooks and authenticating them with the custom header from
**Include header name**.

TIMIFY does not sign payloads, so there is no HMAC to verify. The handler looks up the header you
configured (`TIMIFY_WEBHOOK_HEADER`, default `Authorization`) and compares its whole value with
`TIMIFY_WEBHOOK_SECRET` using a constant-time comparison. The route reads the body with `request.text()`, so any content type works.

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.

> Sync-type webhooks, such as Before Confirmations, expect a synchronous answer and aren't supported.

## Prerequisites

- Node.js 20+
- A TIMIFY application with a webhook subscription (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `TIMIFY_WEBHOOK_HEADER` and `TIMIFY_WEBHOOK_SECRET` to the header name and value you
   entered under **Include header name** in the subscription.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/timify`.

## Test

```bash
npm test
```

The tests cover every webhook and type from TIMIFY's scope table with correct, wrong and missing
header values. No TIMIFY account is needed.

To try it by hand (the body is illustrative; TIMIFY's overview doesn't document the fields):

```bash
curl -X POST http://localhost:3000/webhooks/timify \
  -H "Content-Type: application/json" \
  -H "Authorization: $TIMIFY_WEBHOOK_SECRET" \
  -d '{"webhook":"Event","type":"Created","data":{"id":"evt_123"}}'
```

## Receive Webhooks Locally

TIMIFY can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 timify --path /webhooks/timify
```

Use the printed URL as the Server URL of the subscription.

## How It Works

- `lib/verify-timify.ts`: `verifyTimifyRequest()`
- `app/webhooks/timify/route.ts`: the `POST /webhooks/timify` route

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches defensively on the webhook name (`Customers`, `Event`, `Events`,
   `Services`, `Resource`, `Company`, `Manager`, `Enterprise`, `Customer Fields`, `Shift`,
   `Notification`, `Service Groups`) and acknowledges anything it doesn't recognise.
4. It returns `200 {"received": true}`.
