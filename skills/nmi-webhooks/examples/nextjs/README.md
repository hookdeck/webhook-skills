# NMI Webhooks - Next.js Example

Minimal example of receiving NMI (Network Merchants) webhooks with
`Webhook-Signature` verification using the Next.js App Router.

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

## Run

```bash
npm run dev
```

The webhook route is served at `POST http://localhost:3000/webhooks/nmi`.

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

- The route handler (`app/webhooks/nmi/route.ts`) reads the **raw body** via
  `await request.text()` — required for HMAC verification.
- NMI sends `Webhook-Signature: t=<nonce>,s=<hex>`. NMI calls **`t` a nonce**
  and documents no replay window to enforce.
- It computes `HMAC-SHA256(NMI_SIGNING_KEY, "<nonce>.<raw_body>")`, hex-encodes
  it, and compares to `s` (401 on mismatch), then dispatches on the
  `transaction.<action>.<result>` event type and returns **200** quickly.

See [../../references/verification.md](../../references/verification.md) for details.
