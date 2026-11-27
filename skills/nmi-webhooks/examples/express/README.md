# NMI Webhooks - Express Example

Minimal example of receiving NMI (Network Merchants) webhooks with
`Webhook-Signature` verification.

## Prerequisites

- Node.js 18+
- An NMI gateway account with a **webhooks signing key** (Merchant Portal
  → Settings → Webhooks)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your NMI **webhooks signing key** to `.env` as `NMI_SIGNING_KEY`.
   (This is the signing key from Settings → Webhooks, not your gateway API key.)

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real signatures):

```bash
npm test
```

## Receive real webhooks locally

Start a tunnel (no account required) and point it at your local handler:

```bash
npx hookdeck-cli listen 3000 nmi --path /webhooks/nmi
```

Register the printed public URL as your endpoint under **Settings → Webhooks** in
the Merchant Portal, then run a test transaction and watch the delivery
arrive.

## How It Works

- NMI POSTs the event body with a `Webhook-Signature: t=<nonce>,s=<hex>` header.
- **NMI calls `t` a nonce** and documents no replay window to enforce.
- The handler reads the **raw body**, computes
  `HMAC-SHA256(NMI_SIGNING_KEY, "<nonce>.<raw_body>")`, hex-encodes it, and
  compares to `s` (401 on mismatch).
- Event names are dotted `transaction.<action>.<result>`; the handler dispatches
  on the action and returns **200** quickly so NMI does not retry.

See [../../references/verification.md](../../references/verification.md) for details.
