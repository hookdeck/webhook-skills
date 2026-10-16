# Fanvue Webhooks - Next.js Example

Minimal Next.js App Router example of receiving Fanvue webhooks with `X-Fanvue-Signature` verification, including the unsigned verification probe and the two-MAC header sent during secret rotation.

## Prerequisites

- Node.js 22.12+
- A Fanvue app in the Developer Area and its webhook signing secret (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Fanvue signing secret to `.env.local` as `FANVUE_WEBHOOK_SECRET`, exactly as Fanvue shows it (keep any `whsec_` prefix).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000.

## Test

### Run unit tests

```bash
npm test
```

### Forward live events with the Hookdeck CLI

```bash
# No account required — first run prints a public URL
npx hookdeck-cli listen 3000 fanvue --path /webhooks/fanvue
```

Use the printed URL as the endpoint on your app's **Events** tab, then click **Test** on the row. A test delivery carries a real signature, so a `200` proves the check end to end.

## Files

- `app/webhooks/fanvue/route.ts` — the `POST` handler: probe, signature check, routing on `type`.
- `lib/fanvue-signature.ts` — header parser, HMAC verification and idempotency key. Kept out of `route.ts` because App Router route files may only export HTTP methods and route config.
