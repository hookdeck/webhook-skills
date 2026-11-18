# MakePlans Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [MakePlans](https://makeplans.com) webhooks and verifying the `X-MakePlans-Signature` HMAC.

## Prerequisites

- Node.js 18+
- A MakePlans account and its Account secret (Setup > Webhooks) (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `MAKEPLANS_ACCOUNT_SECRET` in `.env.local` to the Account secret shown on the MakePlans Webhooks page (not the API key).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/makeplans` in [app/webhooks/makeplans/route.ts](app/webhooks/makeplans/route.ts); the verification code is in [lib/verify-makeplans.ts](lib/verify-makeplans.ts).

## Test

```bash
npm test
```

The tests cover a valid signature, a base64 digest (rejected), a signature without the `sha256=` prefix (rejected), another secret, a tampered body, a missing header, a trailing newline in the secret, invalid JSON, and a missing secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 makeplans --path /webhooks/makeplans
```

Add a MakePlans webhook with the printed URL and the event `booking.*`, then create a booking.

## Notes

- The route reads `request.arrayBuffer()` before parsing. The HMAC covers the exact raw body, so don't call `request.json()` first.
- Hex encoding is inferred from MakePlans' example value. If a real delivery doesn't verify, compare against a base64 digest.
