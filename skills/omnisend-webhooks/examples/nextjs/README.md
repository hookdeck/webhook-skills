# Omnisend Webhooks - Next.js Example

Minimal example of receiving Omnisend automation webhooks and authenticating them with a shared
secret header.

Omnisend does not sign webhooks, so there is no HMAC to verify. You add a secret header (for
example `X-Webhook-Secret`) to the automation's **send webhook** action, and the handler compares
the **whole** header value with `OMNISEND_WEBHOOK_SECRET` in constant time. The header name comes
from `OMNISEND_WEBHOOK_HEADER` (default `X-Webhook-Secret`). The route reads the body with `request.text()`, so any content type works.

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp), so use HTTPS and rotate the secret if it leaks.

## Prerequisites

- Node.js 18+
- An Omnisend account on a paid plan (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `OMNISEND_WEBHOOK_SECRET` to the exact value you put in the webhook action's header (and
   `OMNISEND_WEBHOOK_HEADER` if you used a different header name).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/omnisend`.

## Test

```bash
npm test
```

The tests cover correct, wrong, missing and different-length secrets, a custom header name, a
Bearer-style whole value, and the body checks. No Omnisend account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/omnisend \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $OMNISEND_WEBHOOK_SECRET" \
  -d '{"contactEmail":"jane@example.com","contactName":"Jane","event":"subscribed"}'
```

## Receive Webhooks Locally

Omnisend can't reach `localhost` and requires an HTTPS `callbackUrl`. Tunnel to your machine with
the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 omnisend --path /webhooks/omnisend
```

Use the printed URL as the `callbackUrl` of the send webhook action.

## How It Works

- `lib/verify-omnisend.ts`: `verifyOmnisendRequest()`; `app/webhooks/omnisend/route.ts`: the `POST` handler

1. The secret header is checked before the body is parsed. A missing header or mismatch returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `event` field of your body template: `subscribed` and `placed order`
   are handled; anything else is logged.
4. It returns `200 {"received": true}`.
