# Checkout.com Webhooks - Next.js Example

Minimal Next.js App Router example of receiving Checkout.com webhooks with
`Cko-Signature` verification (HMAC-SHA256 over the raw body, hex-encoded) plus
the optional static `Authorization` key.

## Prerequisites

- Node.js 18+
- A Checkout.com account with a webhook configuration and a **signature key**
  (Dashboard → Developers → Webhooks → Create configuration → *Generate key*)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Add your Checkout.com **signature key** to `.env.local` as
   `CHECKOUT_WEBHOOK_SIGNATURE_KEY`. If you also generated an authorization
   header key, set `CHECKOUT_WEBHOOK_AUTHORIZATION_KEY`; otherwise leave it
   empty and that check is skipped.

   The signature key is used **as-is** as a UTF-8 HMAC key — do not decode it.
   On the current platform it is **not** your `sk_...` secret API key.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, endpoint
`POST /webhooks/checkout-com` (`app/webhooks/checkout-com/route.ts`).

## Test

```bash
npm test
```

The tests generate real `Cko-Signature` values with the same algorithm
Checkout.com uses — HMAC-SHA256 of the raw body, hex — and cover tampering,
wrong keys, the missing header, uppercase hex, base64 digests, `sha256=`
prefixes, special characters (©, ®, ™), the optional `Authorization` key and
fail-closed behaviour when the secret is unset.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 checkout-com --path /webhooks/checkout-com
```

No account required — the CLI creates a guest account on first run and prints a
public HTTPS URL plus a web UI for inspecting each request (raw body and
`Cko-Signature` header included, which is what you want when debugging). Paste
the printed URL into the webhook's **Endpoint URL** in the Checkout.com
Dashboard, then create a sandbox payment to trigger `payment_approved` and
`payment_captured`.

Checkout.com sends **no handshake, challenge or special test envelope** — every
delivery is an ordinary signed event.

## What this example demonstrates

- **`await request.text()` before anything else** — Checkout.com signs the exact
  bytes it sent. Calling `request.json()` first consumes the body and leaves you
  with a parsed object you cannot re-serialize byte for byte. (App Router Route
  Handlers give you the raw body directly — there is no `bodyParser: false`
  config to set, unlike the old Pages Router API routes.)
- **Verify, then parse.** `JSON.parse` only runs after the signature checks out.
- **Length guard before `crypto.timingSafeEqual`** — it throws on mismatched
  lengths, and an uncaught throw becomes a 500 that Checkout.com retries eight
  times over ~30 hours.
- **Fail closed** — an unset `CHECKOUT_WEBHOOK_SIGNATURE_KEY` returns 500 (your
  server is misconfigured), a bad signature returns 401 (the request is wrong).
  Verification is never silently skipped.
- **No timestamp check.** There is no `Cko-Timestamp` header and no signed
  timestamp, so there is no replay window to enforce. Replay protection is
  deduplication on the event `id` (`evt_…`).
- **`created_on ?? timestamp`** — the field name genuinely varies by event
  (`payment_approved` has `created_on`; `payment_captured` has `timestamp`).
- **`amount` is the minor currency unit** — `{"amount": 20, "currency": "USD"}`
  is $0.20.

## Notes

- Checkout.com's official SDKs manage workflows but ship **no
  webhook-signature verify helper**, so verification here is a manual HMAC with
  `node:crypto`. Don't add `checkout-sdk-node` for this.
- The route runs on the **Node.js runtime** (the default for Route Handlers).
  `node:crypto` is unavailable on the Edge runtime — if you set
  `export const runtime = 'edge'`, rewrite the HMAC with Web Crypto
  (`crypto.subtle.importKey` + `sign`).
- Checkout.com's 10-second budget is real. This example awaits `handleEvent`
  because the work is trivial; for anything slower, enqueue and return
  immediately.
- **Ordering is not guaranteed** — `payment_captured` can arrive before
  `payment_approved`. Make each handler independently correct.
- For the signature scheme in detail, the optional `Authorization` key and
  previous-platform accounts, see
  [../../references/verification.md](../../references/verification.md).
