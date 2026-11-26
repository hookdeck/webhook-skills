# Alipay Webhooks - Next.js Example

Minimal example of receiving Alipay (Antom) webhooks in a Next.js App
Router route handler, with RSA256 signature verification and the fixed acknowledgement response
Antom expects.

## Prerequisites

- Node.js 18+
- An Antom account with a Client ID and the Antom public key (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Fill in `.env`:
   - `ALIPAY_CLIENT_ID` — your Client ID
   - `ALIPAY_PUBLIC_KEY` — Antom public key (verifies inbound notifications)

   Store PEM values on one line with literal `\n` between lines.

## Run

```bash
npm run dev
```

The webhook endpoint is `POST /webhooks/alipay` (handled by
`app/webhooks/alipay/route.ts`). It runs on the Node.js runtime because RSA
verification needs Node's `crypto` module.

## Test locally

```bash
npx hookdeck-cli listen 3000 alipay --path /webhooks/alipay
```

Use the printed URL as your `paymentNotifyUrl` when creating a sandbox payment.

## Run the tests

```bash
npm test
```

The tests (Vitest) generate real RSA256 signatures and assert the handler returns the fixed acknowledgement body.

## How it works

1. `await req.text()` reads the **raw** body — the signature covers those exact bytes.
2. The `Signature` / `Client-Id` / `Request-Time` headers are parsed; the
   two-line content is verified with Antom's public key (SHA256withRSA; the signature is base64, then URL-encoded).
3. On success the handler reads the type from `notifyType`, `authorizationNotifyType`,
   `disputeNotificationType` or `subscriptionNotificationType` and returns the fixed
   200 `SUCCESS` body (no signature needed) so Antom stops resending.

See [../../references/verification.md](../../references/verification.md) for details.
