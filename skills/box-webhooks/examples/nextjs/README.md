# Box Webhooks - Next.js Example

Minimal example of receiving Box V2 webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Box developer app with a V2 webhook and its primary signature key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your primary signature key to `.env.local` (`BOX_WEBHOOK_SECRET`). Get it in the Box Developer Console: your app → **Webhooks** → **Manage signature keys**.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

The handler route (`app/webhooks/box/route.ts`) reads the raw bytes with `await request.arrayBuffer()` and verifies `BOX-SIGNATURE-PRIMARY`: standard base64 HMAC-SHA256 of the raw body followed by the `BOX-DELIVERY-TIMESTAMP` header value (no separator). Only the primary signature is verified. A bad, missing or malformed signature gets a `401`. It accepts GET, POST, PUT, PATCH and DELETE, because Box's docs don't name the delivery method. The timestamp check is off by default because retries and replays keep the original timestamp; set `BOX_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (Box suggests `600`) to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 box --path /webhooks/box
```

Use the Hookdeck URL as the `address` when you create the V2 webhook through the Box API (`POST /2.0/webhooks`). Hookdeck's Box source pre-selects POST without managing the method, so allow any other method Box uses on the source.
