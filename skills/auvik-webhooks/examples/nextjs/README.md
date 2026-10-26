# Auvik Webhooks - Next.js Example

Minimal example of receiving Auvik alert webhooks and authenticating them with the custom
header from Header authentication.

Auvik does not sign payloads, so there is no HMAC to verify. The handler reads the header named
by `AUVIK_WEBHOOK_HEADER` (default `Authorization`) and compares its whole value with
`AUVIK_WEBHOOK_SECRET` in constant time. The route reads the body with
`request.text()`, so any content type works. A static header authenticates the
sender, not the body, and gives no replay protection: use HTTPS and rotate the value if it leaks.

Choose Header authentication on the Auvik webhook, not OAuth.

## Prerequisites

- Node.js 18+
- An Auvik Webhook integration using Header authentication (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `AUVIK_WEBHOOK_HEADER` to the Key and `AUVIK_WEBHOOK_SECRET` to the exact Value you entered in Auvik.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/auvik`.

## Test

```bash
npm test
```

The tests send `Triggered` and `Cleared` alerts with correct, wrong and missing header values.
No Auvik account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/auvik \
  -H "Content-Type: application/json" \
  -H "$AUVIK_WEBHOOK_HEADER: $AUVIK_WEBHOOK_SECRET" \
  -d '{"alertId":"1234","alertName":"Device offline","alertStatus":0,"alertStatusString":"Triggered","entityName":"core-switch-01","companyName":"Acme MSP"}'
```

## Receive Webhooks Locally

Auvik can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 auvik --path /webhooks/auvik
```

Put the printed URL in the Auvik Webhook integration.

## How It Works

- `lib/verify-auvik.ts`: `verifyAuvikRequest()`
- `app/webhooks/auvik/route.ts`: the `POST /webhooks/auvik` route

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `alertStatusString`: `Triggered` or `Cleared`.
4. It returns `200 {"received": true}`.
