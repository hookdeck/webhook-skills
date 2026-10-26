# Lumos Webhooks - Next.js Example

Minimal example of receiving Lumos provisioning and deprovisioning webhooks and
authenticating them with a custom header you add in Lumos.

Lumos also signs each request (HMAC-SHA256 in `X-Lumos-Webhook-Signature`), but the header
format is in a login-gated help article, so **this example does not verify that signature**. It
checks the custom header instead. A static shared credential authenticates the sender, not the
body, and gives no replay protection, so use HTTPS and rotate the credential if it leaks.

The header name comes from `LUMOS_WEBHOOK_HEADER` (default `Authorization`) and the expected
value from `LUMOS_WEBHOOK_SECRET`. The whole value is compared in constant time, including any
`Bearer ` prefix you typed in Lumos. The route reads the body with `request.text()`,
so any content type works.

> Use notification webhooks such as provisioning and deprovisioning. Pre-approval and request validation webhooks expect a decision back and aren't supported.

## Prerequisites

- Node.js 20+
- A Lumos webhook with a custom header (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `LUMOS_WEBHOOK_HEADER` and `LUMOS_WEBHOOK_SECRET` to match the custom header on the Lumos webhook.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/lumos`.

## Test

```bash
npm test
```

The tests send an illustrative payload with correct, wrong, missing and differently-named
headers. No Lumos account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/lumos \
  -H "Content-Type: application/json" \
  -H "Authorization: $LUMOS_WEBHOOK_SECRET" \
  -d '{"user":{"email":"ada@example.com"},"permissions":["Agent License"]}'
```

## Receive Webhooks Locally

Lumos can't reach `localhost` (and requires HTTPS). Tunnel to your machine with the Hookdeck CLI
(no account, no install):

```bash
npx hookdeck-cli listen 3000 lumos --path /webhooks/lumos
```

Put the printed URL in the Lumos webhook.

## How It Works

- `lib/verify-lumos.ts`: `verifyLumosRequest()`
- `app/webhooks/lumos/route.ts`: the `POST /webhooks/lumos` route

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler logs the user and permissions. The payload field names are illustrative; Lumos
   doesn't publish them.
4. It returns `200 {"received": true}`.
