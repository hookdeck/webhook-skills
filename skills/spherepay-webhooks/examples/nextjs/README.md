# SpherePay Webhooks - Next.js Example

Minimal example of receiving SpherePay webhooks with signature verification.

## Prerequisites

- Node.js 18+
- SpherePay account with a webhook endpoint registered (`POST /v2/webhook-endpoints`) and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your endpoint's signing secret to `.env.local` (`SPHEREPAY_WEBHOOK_SECRET`). Paste the whole secret, including the whsec_ prefix. SpherePay uses it as a plain HMAC key.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000; the webhook route is `POST /webhooks/spherepay`.

The handler checks `Sphere-Signature` (hex HMAC-SHA256 of `{Sphere-Timestamp}.{raw body}`) using the raw request bytes (`await request.arrayBuffer()`) and parses the JSON only after the check passes. SpherePay does not use Standard Webhooks, so there is no `standardwebhooks`/`svix` dependency. The timestamp check is off by default because Hookdeck retries and replays resend the original timestamp; set `SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to opt in.

## Test

```bash
npm test
```

The suite includes the signature example published in SpherePay's docs (see `references/verification.md`).

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 spherepay --path /webhooks/spherepay
```

Use the Hookdeck URL as the `url` when registering the endpoint. SpherePay makes one delivery attempt per event (no automatic retries), so respond with a 2xx within 15 seconds.
