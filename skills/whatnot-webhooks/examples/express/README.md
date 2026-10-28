# Whatnot Webhooks - Express Example

Minimal example of receiving Whatnot webhooks with Standard Webhooks signature
verification (`webhook-id`, `webhook-timestamp`, `webhook-signature`).

## Prerequisites

- Node.js 18+
- Your Whatnot webhook secret (`wn_wh_...`), from your client app in the
  Whatnot developer dashboard

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Set `WHATNOT_WEBHOOK_SECRET` in `.env` to the secret from the dashboard,
   `wn_wh_` prefix included.

## Run

```bash
npm start
```

Endpoint: `POST http://localhost:3000/webhooks/whatnot`

## Test

```bash
npm test
```

The tests check Whatnot's published golden vector byte for byte (with the
clock frozen at its timestamp), then cover every topic, a `wn_wh_` prefix the
library isn't told about, a stale timestamp, a signature list where only one
entry is valid, re-serialised JSON, missing `webhook-*` headers, the legacy
`X-Whatnot-Webhook-Signature` scheme, wrong secrets, tampered bodies,
duplicate `webhook-id`s, unknown types, null customer data and the
fail-closed path when the secret is unset.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 whatnot --path /webhooks/whatnot
```

Register the printed HTTPS URL in the Whatnot developer dashboard (see
[../../references/setup.md](../../references/setup.md)). The CLI's web UI shows
each request's raw body and headers.

## What this example demonstrates

- **Standard Webhooks verification** with the `standardwebhooks` library:
  base64 HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{raw body}`,
  compared in constant time against every `v1,` entry, with the 5-minute
  timestamp tolerance.
- **`wn_wh_` handling.** The secret is copied from the dashboard as-is; the
  code strips `wn_wh_` before the library base64-decodes the rest. The library
  only strips its own `whsec_` prefix.
- **Raw-body verification.** `express.raw({ type: '*/*' })` on the webhook route keeps the exact
  bytes Whatnot signed. Don't mount `express.json()` ahead of it: Whatnot
  sends space-separated JSON, so re-serialising changes the bytes.
- **Fail closed.** An unset `WHATNOT_WEBHOOK_SECRET` returns 500; missing
  `webhook-*` headers or an invalid signature return 400. Verification is never
  skipped.
- **Dedupe on the `webhook-id` header.** Delivery is at least once and retries
  reuse the id. The in-memory set is for demonstration; use a database or
  Redis in production.
- **Route on `type`, read `data`.** All 18 documented topics are handled.
  Unknown types get a 2xx so Whatnot doesn't retry them.
- **Null-safe customer data.** `buyer`, `recipient` and `documents` are `null`
  without the `read:customers` scope.
- **`seller_id`** is read from the signed body so multi-seller apps know whose
  event it is.

See [../../references/verification.md](../../references/verification.md) for
the scheme in detail.
