# Ship24 Webhooks - Next.js Example

Minimal example of receiving Ship24 tracking webhooks and authenticating them with the
`Authorization: Bearer <webhook secret>` header.

Ship24 does not sign payloads, so there is no HMAC to verify. The handler compares the bearer
value with your Webhook Secret using a constant-time comparison. The route reads the body with
`request.text()`, so any content type works, and parses it only after the check.
A static shared credential authenticates the sender, not the body, and gives no replay protection:
use HTTPS and rotate the secret if it leaks.

## Prerequisites

- Node.js 20+
- A Ship24 account (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Paste the Webhook Secret from your Ship24 dashboard into `.env` as `SHIP24_WEBHOOK_SECRET`
   (just the secret, without `Bearer `).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/ship24`.

## Test

```bash
npm test
```

The tests send both topics with correct, wrong and missing secrets, and check deduplication.
No Ship24 account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/ship24 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SHIP24_WEBHOOK_SECRET" \
  -d '{"trackings":[{"metadata":{"generatedAt":"2025-03-04T17:13:35.000Z","messageId":"test-1","topic":"tracking/events"},"tracker":{"trackingNumber":"9400115901047177598206"},"events":[{"eventId":"e1","status":"In transit","occurrenceDatetime":"2025-03-04T17:12:57"}]}]}'
```

## Receive Webhooks Locally

Ship24 can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 ship24 --path /webhooks/ship24
```

Put the printed URL in the Ship24 dashboard as the Webhook URL.

## How It Works

- `lib/verify-ship24.ts`: `verifyShip24Request()`
- `app/webhooks/ship24/route.ts`: the `POST /webhooks/ship24` route

1. The `Authorization` header must be `Bearer <secret>` (scheme in any case). Failure returns `401`.
2. The body must be `{ "trackings": [...] }` (`400` otherwise).
3. For each item the handler skips an already-seen `metadata.messageId`, then dispatches on
   `metadata.topic`: `tracking/events` or `tracking/pod`.
4. It returns `200 {"received": true}`. A handler error returns `500` so Ship24 retries.
