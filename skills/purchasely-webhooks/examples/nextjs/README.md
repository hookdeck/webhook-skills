# Purchasely Webhooks - Next.js Example

Minimal example of receiving Purchasely server events with signature verification.

Purchasely signs each delivery with HMAC-SHA256 over the `X-PURCHASELY-TIMESTAMP` header value
followed by the raw body (no separator) and sends the lowercase hex digest in
`X-PURCHASELY-REQUEST-SIGNATURE`. The handler verifies the exact bytes received, then dispatches
on the payload's `event_name`.

## Prerequisites

- Node.js 18+
- A Purchasely app with a webhook shared secret (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `PURCHASELY_WEBHOOK_SECRET` to the webhook shared secret from the Purchasely Console
   ([YOUR APP] > Settings > Webhooks).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts events at `POST /webhooks/purchasely`.

## Test

```bash
npm test
```

The tests include the worked example from the Purchasely docs (secret `foobar`, timestamp
`1698322022`, signature `f3c2a452e9ea72f41107321aeaf7999f1054148866a710c9b23f9f501785e2a4`),
plus tampered bodies, wrong secrets, malformed digests, every handled event, and duplicates.
No Purchasely account is needed.

## Receive Webhooks from Purchasely Locally

Purchasely needs a public `https` URL. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 purchasely --path /webhooks/purchasely
```

Use the printed URL as the Client webhook URL in the Purchasely Console.

## Notes

- Purchasely acknowledges only an exact HTTP `200`. Any other code, other 2xx included, is retried
  (25 times over about 20 days), and later webhooks for that user wait until it succeeds. Failed
  verification returns `401`, so check your secret before going live.
- Replay protection is off by default because Hookdeck retries and replays resend the original
  timestamp. Set `PURCHASELY_WEBHOOK_TOLERANCE_SECONDS` to opt in.
- The in-memory duplicate check on `event_id` is for demonstration; use a shared store in production.

## How It Works

- `lib/verify-purchasely.ts`: `verifyPurchaselyRequest()` (bytes-level HMAC, constant-time compare)
- `app/webhooks/purchasely/route.ts`: the `POST` handler, reading the body with `request.arrayBuffer()`
