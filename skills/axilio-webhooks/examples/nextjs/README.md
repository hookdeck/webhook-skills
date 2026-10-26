# Axilio Webhooks - Next.js Example

Minimal Next.js App Router example of receiving [Axilio](https://axilio.ai) webhooks with Standard Webhooks signature verification, using the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package that Axilio's docs recommend.

## Prerequisites

- Node.js 18+
- An Axilio organization with a webhook destination registered under Settings > Webhooks
- The destination's signing secret (`whsec_...`). Axilio shows it **only once**, at registration (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add the full signing secret, including the `whsec_` prefix, to `AXILIO_WEBHOOK_SECRET` in `.env.local`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/axilio` (`app/webhooks/axilio/route.ts`).

## Test

```bash
npm test
```

The tests sign payloads with Axilio's algorithm (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`) and cover all 28 documented event types, dashboard test deliveries, non-JSON content types, tampered bodies, stale timestamps, multiple signatures, redeliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 axilio --path /webhooks/axilio
```

Register the printed `https://` URL as a destination in Settings > Webhooks, subscribe to the events you want, then click **Test** on the destination's page to send an event's example payload (`"test": true`).

## Notes

- The route reads the body with `await request.text()`. The signature covers the exact raw bytes, so `request.json()` before verification breaks it. Reading text works for any content type.
- If `AXILIO_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so a retry later than that is rejected. [references/verification.md](../../references/verification.md) has a manual verifier where the window can be dropped or widened.
- Axilio delivers at least once and does not guarantee order. Redeliveries are deduped on the body `id` (in memory here; use a database or cache in production), and `occurred_at` tells you which event is newer.
