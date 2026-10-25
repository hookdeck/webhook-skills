# Planning Center Webhooks - Next.js Example

Minimal example of receiving Planning Center webhooks in a Next.js App Router route handler, with signature verification (`X-PCO-Webhooks-Authenticity`, HMAC-SHA256).

## Prerequisites

- Node.js 18+
- A Planning Center webhook subscription and its authenticity secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add the subscription's **authenticity secret** to `.env.local` as `PLANNING_CENTER_AUTHENTICITY_SECRET`. Use it as-is: it is the HMAC key as a plain string, not hex-decoded.

## Run

```bash
npm run dev
```

Webhook endpoint: `POST http://localhost:3000/webhooks/planning-center`.

## Test

```bash
npm test
```

The tests reproduce the worked example from the Planning Center docs (secret `2608ab74...`, expected signature `a0782fde...`) and cover invalid, tampered and malformed signatures.

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 planning-center --path /webhooks/planning-center
```

Then set the Hookdeck URL as the subscription URL at https://api.planningcenteronline.com/webhooks.

## How It Works

- The route reads `request.text()` so the signature is checked against the exact bytes received, whatever the content type. Verification lives in `lib/planning-center.ts`.
- The body is JSON:API: `data` is an array of `EventDelivery` objects with `attributes.name`, `attributes.attempt` and `attributes.payload`. `payload` is a JSON string that is parsed a second time.
- Respond `200` to acknowledge. Any other status is retried; a `410` deactivates the subscription.
