# Flutterwave Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [Flutterwave webhooks](https://developer.flutterwave.com/v4/docs/webhooks) and verifying both schemes: the v4 `flutterwave-signature` (base64 HMAC-SHA256 of the raw body, keyed with your secret hash) and the v3 `verif-hash` (the secret hash itself).

## Prerequisites

- Node.js 18+
- A Flutterwave account with a webhook URL and secret hash (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `FLUTTERWAVE_SECRET_HASH` to the secret hash from Settings > Webhooks.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/flutterwave` in [app/webhooks/flutterwave/route.ts](app/webhooks/flutterwave/route.ts); verification is in [lib/verify-flutterwave.ts](lib/verify-flutterwave.ts).

## Test

```bash
npm test
```

The tests sign requests the way Flutterwave's v4 helper does. They check a fixed test vector, v4 `charge.completed` and `transfer.disburse`, v3 `charge.completed`, wrong secrets, tampered bodies, a hex digest, the secret hash sent as the v4 header, no fallback to `verif-hash` after a bad v4 signature, duplicate deliveries, invalid JSON, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 flutterwave --path /webhooks/flutterwave
```

Paste the printed URL in Settings > Webhooks, set the secret hash, and trigger a test payment or transfer (v4 sandbox calls need an `X-Scenario-Key` header for a webhook to be sent).

## Notes

- The route reads `request.arrayBuffer()` before parsing. The v4 signature covers the exact raw body, so `request.json()` before verifying breaks it.
- Flutterwave's v4 docs contradict themselves: the HMAC helper signs the raw body, but later examples compare the header to the secret hash. This example follows the HMAC helper. See [verification](../../references/verification.md).
- Respond with exactly `200` within 60 seconds. Anything else is a failure, retried 3 times 30 minutes apart if retries are enabled.
- Re-query the transaction through the Flutterwave API before giving value.
