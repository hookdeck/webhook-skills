# PayPal Webhooks — Next.js Example

Next.js App Router route handler that receives PayPal webhooks and verifies
the RSA-SHA256 signature against PayPal's public certificate (offline path).

## Prerequisites

- Node.js **22+** (uses `zlib.crc32`)
- A PayPal Developer app with a registered webhook — see
  [../../references/setup.md](../../references/setup.md)

## Setup

```bash
npm install
cp .env.example .env
# Set PAYPAL_WEBHOOK_ID in .env
```

## Run

```bash
npm run dev
```

Webhook endpoint: `POST http://localhost:3000/webhooks/paypal`

## Test

```bash
npm test
```

Tests generate a self-signed RSA key pair, preload the cert cache with the
public key, then exercise the verification logic directly. They do **not**
make real HTTPS calls.

## How Verification Works Here

1. `route.ts` reads the raw bytes of the request via `request.arrayBuffer()`.
2. It extracts the four `paypal-*` headers.
3. It validates that `paypal-cert-url`'s host is on `.paypal.com`.
4. It fetches the cert from that URL (cached by URL).
5. It builds `transmissionId|transmissionTime|webhookId|crc32(body)` and
   verifies the base64 signature with RSA-SHA256.

See [../../references/verification.md](../../references/verification.md).
