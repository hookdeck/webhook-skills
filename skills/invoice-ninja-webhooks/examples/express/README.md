# Invoice Ninja Webhooks - Express Example

Minimal example of receiving Invoice Ninja webhooks and authenticating them with a secret header.

Invoice Ninja does not sign payloads, so there is no HMAC to verify. You add a secret header
(key/value) to the webhook in Invoice Ninja, and the handler compares that header's **whole**
value with `INVOICE_NINJA_WEBHOOK_SECRET` in constant time. The header name comes from
`INVOICE_NINJA_WEBHOOK_HEADER` (default `Authorization`) and is matched case-insensitively. A
`Bearer ` prefix is not parsed: it is part of the value. The route reads the body with `express.raw({ type: '*/*' })`, so any content type works, and parses JSON only after the credential check.

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Use HTTPS and rotate the value if it leaks.

## Prerequisites

- Node.js 18+
- An Invoice Ninja account (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `INVOICE_NINJA_WEBHOOK_HEADER` and `INVOICE_NINJA_WEBHOOK_SECRET` to the header key and
   exact value you add to the webhook's **Headers** in Invoice Ninja.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts `POST` and `PUT` at `/webhooks/invoice-ninja`.

## Test

```bash
npm test
```

The tests cover correct, wrong and missing credentials, every accepted method, an empty body,
invalid JSON, and routing by `?event=` and by entity shape. No Invoice Ninja account is needed.

To try it by hand:

```bash
curl -X POST "http://localhost:3000/webhooks/invoice-ninja?event=create_invoice" \
  -H "Content-Type: application/json" \
  -H "$INVOICE_NINJA_WEBHOOK_HEADER: $INVOICE_NINJA_WEBHOOK_SECRET" \
  -d '{"id":"Opnel5aKBz","number":"0001","client_id":"Wpmbk5ezJn","amount":100,"line_items":[]}'
```

## Receive Webhooks Locally

Invoice Ninja can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 invoice-ninja --path /webhooks/invoice-ninja
```

Put the printed URL (plus `?event=create_invoice`, for example) in the webhook's Target URL.

## How It Works

- `src/index.js`: `verifyInvoiceNinjaRequest()`, `detectEntity()` and the `/webhooks/invoice-ninja` route

1. The secret header is checked before the body is read. Failure returns `401`, never `404`,
   `405` or `410` (Invoice Ninja deletes the webhook subscription on those).
2. Invoice Ninja always sends a JSON body; an empty body is still acknowledged. A non-empty body must be a JSON object (`400` otherwise).
3. The body is the entity itself and has no event field. The handler uses `?event=` from the target
   URL (`create_invoice`, `create_payment`, `update_client`) and otherwise detects the entity by
   shape (`line_items` document, `applied` payment, `contacts` client).
4. It returns `200 {"received": true}`.
