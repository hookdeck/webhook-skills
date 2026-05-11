# PayPal Webhooks — Express Example

Minimal Express server that receives PayPal webhooks and verifies the
RSA-SHA256 signature against PayPal's public certificate (offline path — no
extra API call back to PayPal).

## Prerequisites

- Node.js **22+** (uses built-in `zlib.crc32`)
- A PayPal Developer app with a registered webhook — see
  [../../references/setup.md](../../references/setup.md)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PAYPAL_WEBHOOK_ID` in `.env` to the ID of the webhook you registered
   in the PayPal Developer Dashboard.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and exposes:

- `POST /webhooks/paypal` — Webhook receiver
- `GET  /health` — Liveness check

## Test

Run the bundled test suite — it generates a self-signed RSA cert in memory,
injects it into the verification cache, signs a payload with the matching
private key, and exercises the full request/response cycle:

```bash
npm test
```

For real end-to-end testing against PayPal:

```bash
# In one terminal
npm start
# In another, expose your local server
npx hookdeck-cli listen 3000 paypal --path /webhooks/paypal
# Set the printed URL as your webhook URL in https://developer.paypal.com/dashboard/applications
# Then fire test events from https://developer.paypal.com/dashboard/webhooksSimulator
```

## How Verification Works Here

1. The route reads `req.body` as a raw `Buffer` (via `express.raw()`).
2. The four `paypal-*` headers are extracted.
3. `paypal-cert-url`'s host is checked against `.paypal.com`.
4. The cert is fetched from that URL (cached by URL in `certCache`).
5. The message `transmissionId|transmissionTime|webhookId|crc32(body)` is
   built and verified with RSA-SHA256.

See [../../references/verification.md](../../references/verification.md) for
the full algorithm and a comparison with the postback API path.
