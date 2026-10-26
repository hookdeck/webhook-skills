# Rewardful Webhooks - Next.js Example

Minimal example of receiving Rewardful webhooks with signature verification in the Next.js App Router.

Rewardful sends `X-Rewardful-Signature`: the lowercase hex HMAC-SHA256 of the raw request body,
keyed with the endpoint's Signing Secret. The route reads the body with
`await request.arrayBuffer()`, so any content type works and the exact bytes are verified, and
parses it only after the check. Rewardful has no Node verification helper, so verification is
manual (`lib/verify-rewardful.ts`).

## Prerequisites

- Node.js 18+
- A Rewardful account with an endpoint and its Signing Secret (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `REWARDFUL_WEBHOOK_SECRET` in `.env.local` to the endpoint's Signing Secret from the
   Webhooks page in the Rewardful dashboard.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/rewardful`.

## Test

```bash
npm test
```

The tests sign the documented `affiliate.confirmed` payload and every handled event with the same
algorithm as Rewardful, and cover wrong, missing, malformed and tampered signatures.

## Receive Webhooks Locally

Rewardful can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 rewardful --path /webhooks/rewardful
```

Put the printed URL in the endpoint's URL field on the Rewardful Webhooks page.

## How It Works

- `lib/verify-rewardful.ts`: `verifyRewardfulSignature()` (64-hex check, HMAC-SHA256, `timingSafeEqual`)
- `app/webhooks/rewardful/route.ts`: the `POST` handler

1. The raw body and `X-Rewardful-Signature` are checked first. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. A repeated `event.id` is acknowledged with `200` and skipped.
4. The handler dispatches on `event.type` and logs events it doesn't handle.
5. It returns `200 {"received": true}`; Rewardful treats any other status as a failure and retries.
