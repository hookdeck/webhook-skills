# Chameleon Webhooks - Next.js Example

Minimal example of receiving Chameleon webhooks with signature verification (App Router).

Chameleon signs the raw request body with HMAC-SHA256 and sends the bare hex digest in
`X-Chameleon-Signature`. The route reads the exact bytes with `await request.arrayBuffer()`, verifies
them, and only then parses the JSON.

## Prerequisites

- Node.js 20+
- A Chameleon account with a Webhook Secret (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `CHAMELEON_WEBHOOK_SECRET` to the Webhook Secret from Integrations -> Webhooks in Chameleon.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/chameleon`.

## Test

```bash
npm test
```

The tests sign every documented event with the real algorithm and also cover bad, missing and
malformed signatures. No Chameleon account is needed.

## Receive Webhooks Locally

Chameleon can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 chameleon --path /webhooks/chameleon
```

Put the printed URL in the endpoint URL field on Chameleon's Webhooks page.

## How It Works

- `lib/verify-chameleon.ts`: `verifyChameleonSignature()` and the optional `sentAtWithinTolerance()`
- `app/webhooks/chameleon/route.ts`: the `POST` handler and event dispatch

1. The raw body is verified against `X-Chameleon-Signature` first. Failure returns `401`.
2. The body must be a JSON object with a `kind` (`400` otherwise).
3. If `CHAMELEON_SENT_AT_TOLERANCE_SECONDS` is set, a `sent_at` outside the window returns `400`.
   It is off by default: nothing signed carries a time, and retries can arrive hours later.
4. Repeated webhook `id`s (Chameleon retries non-200 responses) are acknowledged without reprocessing.
5. The handler dispatches on `kind`, e.g. `tour.completed`, `survey.completed`, `response.finished`.
6. It returns `200 {"received": true}`.
