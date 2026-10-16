# Whatnot Webhooks - Next.js Example

Minimal example of receiving Whatnot Seller API webhooks with signature
verification: HMAC-SHA256 over the raw body, lowercase hex, in
`X-Whatnot-Webhook-Signature`.

## Prerequisites

- Node.js 18+ (Node 24 / npm 11 recommended for installing the test toolchain)
- Your app's **webhook secret key**, issued by a Whatnot representative

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Set `WHATNOT_WEBHOOK_SECRET` in `.env` to the secret Whatnot gave you.

## Run

```bash
npm run dev
```

Endpoint: `POST http://localhost:3000/webhooks/whatnot`

## Test

```bash
npm test
```

The tests sign payloads with the same algorithm Whatnot uses (hex HMAC-SHA256
of the raw body) and check a fixed vector computed with Whatnot's own Python
sample. They cover tampered bodies, wrong secrets, a missing header, uppercase
hex, base64 digests, `sha256=` prefixes, duplicate event ids, unknown topics,
null customer-data fields and the fail-closed path when the secret is unset.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 whatnot --path /webhooks/whatnot
```

Give the printed HTTPS URL to Whatnot when you request your subscription (see
[../../references/setup.md](../../references/setup.md)). The CLI's web UI shows
each request's raw body and headers.

## What this example demonstrates

- **Raw-body verification.** The route handler reads `await request.text()` and verifies before
  parsing JSON. It runs on the Node.js runtime (`export const runtime = 'nodejs'`)
  for `node:crypto`.
- **Hex, no prefix, nothing but the body.** Whatnot signs only the raw body
  and sends the digest as bare lowercase hex. The verifier rejects anything
  that isn't 64 hex characters before comparing.
- **Constant-time comparison.** Whatnot's sample uses `==`; this uses `crypto.timingSafeEqual`.
- **Fail closed.** An unset `WHATNOT_WEBHOOK_SECRET` returns 500; a missing or
  invalid signature returns 400. Verification is never skipped.
- **Dedupe on the envelope `id`.** Whatnot retries non-200 responses up to 5
  times over about 10 minutes. The in-memory set is for demonstration; use a
  database or Redis in production.
- **Route on `topic`, read `object`.** All 11 documented topics are handled.
  Unknown topics get a 200 so Whatnot doesn't retry them.
- **Null-safe customer data.** `shipping_address`, `tracking_info` and
  `label_url` need the `read_customers` scope.
- **`X-Whatnot-Seller-Id`** is read so multi-seller apps know whose event it is.

See [../../references/verification.md](../../references/verification.md) for
the scheme in detail.
