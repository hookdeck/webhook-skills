# Felloh Webhooks - Next.js Example

Minimal example of receiving Felloh webhooks with signature verification (App Router).

Felloh sends the bare hex HMAC-SHA256 of the raw body in `X-Signature`, keyed with the signing key shown when you create the webhook. The route reads the bytes with `await request.arrayBuffer()`, verifies them, then parses the JSON.

## Prerequisites

- Node.js 20+
- A Felloh webhook with its signing key (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Felloh signing key to `.env` as `FELLOH_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/felloh`.

## Test

```bash
npm test
```

The tests sign the documented transaction, refund, booking and user payloads with the real algorithm. No Felloh account is needed.

### Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 felloh --path /webhooks/felloh
```

Use the printed URL as the webhook URL in Felloh, then send a test delivery from the dashboard (it carries `X-Felloh-Test: true`).

## How It Works

- `lib/verify-felloh.ts`: `verifyFellohSignature()`
- `app/webhooks/felloh/route.ts`: the `POST /webhooks/felloh` route

1. The raw body is read as bytes and `X-Signature` is checked (64 hex characters, then constant-time compare). Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. Felloh has no event-name field, so the handler classifies by shape: `user-create`, `refund-status`, `transaction-status`, `booking`.
4. It returns `200 {"received": true}`.
