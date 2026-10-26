# Tripletex Webhooks - Express Example

Minimal example of receiving Tripletex event subscription webhooks and authenticating them with
the custom header you configure on the subscription.

Tripletex does not sign payloads, so there is no HMAC to verify. If you set `authHeaderName` and
`authHeaderValue` on the subscription, Tripletex sends that header as-is on every callback. The
handler compares the whole header value with `TRIPLETEX_WEBHOOK_SECRET` in constant time. The route
reads the body with `express.raw({ type: '*/*' })`, so any content type works.

A static shared credential authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Tripletex account and API access (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `TRIPLETEX_WEBHOOK_HEADER` to the `authHeaderName` you chose (default `Authorization`) and
   `TRIPLETEX_WEBHOOK_SECRET` to the exact `authHeaderValue`, including any `Bearer ` prefix.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/tripletex`.

## Test

```bash
npm test
```

The tests send every documented event with correct, wrong and missing header values. No Tripletex
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/tripletex \
  -H "Content-Type: application/json" \
  -H "Authorization: $TRIPLETEX_WEBHOOK_SECRET" \
  -d '{"subscriptionId":42,"event":"customer.create","id":1001,"value":{"id":1001,"name":"Acme AS"}}'
```

## Receive Webhooks Locally

Tripletex can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 tripletex --path /webhooks/tripletex
```

Use the printed URL as the `targetUrl` of the event subscription.

## How It Works

- `src/index.js`: `verifyTripletexRequest()` plus the `POST /webhooks/tripletex` route

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `event` (`object.verb`): `invoice.charged`, `notification.sent`,
   `voucherstatus.ready`, `closegroup.create`, `closegroup.delete`, and
   `create`/`update`/`delete` for supplier, employee, order, product, account, project, customer,
   contact, archiverelation and voucher.
4. It returns `200 {"received": true}`.
