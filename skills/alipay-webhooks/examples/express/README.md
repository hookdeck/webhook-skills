# Alipay Webhooks - Express Example

Minimal example of receiving Alipay (Antom) webhooks with RSA256
signature verification and the fixed acknowledgement response Antom expects.

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
npm start
```

Server runs on http://localhost:3000 — webhook endpoint `POST /webhooks/alipay`.

## Test locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 alipay --path /webhooks/alipay
```

Use the printed URL as your `paymentNotifyUrl` when creating a sandbox payment,
then complete the payment in the Antom sandbox cashier to trigger a real
`notifyPayment` notification.

## Run the tests

```bash
npm test
```

The tests generate real RSA256 signatures with a key pair that stands in for
Antom's, and assert the handler returns the fixed acknowledgement body.

## How it works

1. `express.raw()` captures the exact raw body — the signature covers those bytes.
2. `Signature`, `Client-Id`, and `Request-Time` headers are parsed; the two-line
   content `POST /webhooks/alipay\n<Client-Id>.<Request-Time>.<body>` is verified
   with Antom's public key (SHA256withRSA; the signature is base64, then URL-encoded).
3. On success the handler reads the type from `notifyType`, `authorizationNotifyType`,
   `disputeNotificationType` or `subscriptionNotificationType` and returns the fixed
   200 `SUCCESS` body (no signature needed) so Antom stops resending.

See [../../references/verification.md](../../references/verification.md) for details.
