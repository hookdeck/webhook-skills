# FirstPromoter Webhooks - Next.js Example

Minimal example of receiving FirstPromoter Webhooks v2 and authenticating them with a custom
secret header.

FirstPromoter does not sign payloads, so there is no HMAC to verify. You add a custom header to
the webhook subscription; the handler compares that header's whole value with your stored
secret using a constant-time comparison. The route handler reads the body as text, so any content type works, and parses it only after the check.

Covers Webhooks v2 only: add a custom header to the subscription and enter it here. Legacy webhooks cannot send custom headers.

A static shared credential authenticates the sender, not the body, and gives no replay
protection: use HTTPS, rotate the credential if it leaks, and dedupe on `event_id` (the example
does, in memory).

## Prerequisites

- Node.js 18+
- A FirstPromoter account (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `FIRSTPROMOTER_WEBHOOK_HEADER` (default `Authorization`) and `FIRSTPROMOTER_WEBHOOK_SECRET`
   (the exact, whole value, including any `Bearer ` prefix) to match the header you add to the
   subscription.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/firstpromoter`.

## Test

```bash
npm test
```

The tests send the documented payloads and every handled event with correct, wrong and missing
header values. No FirstPromoter account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/firstpromoter \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-value" \
  -d '{"event_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","event_type":"promoter.created","action":"created","entity_type":"promoter","entity_id":12345,"changes":{},"data":{"id":12345,"email":"jane@example.com"},"timestamp":"2025-01-15T10:30:00Z"}'
```

## Receive Webhooks Locally

FirstPromoter can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 firstpromoter --path /webhooks/firstpromoter
```

Put the printed URL in the subscription's **url** field.

## How It Works

- `lib/verify-firstpromoter.ts`: `verifyFirstPromoterRequest()`
- `app/webhooks/firstpromoter/route.ts`: the `POST /webhooks/firstpromoter` route handler

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. A repeated `event_id` is acknowledged with `200` and skipped.
4. The handler dispatches on `event_type` (`promoter.created`, `referral.converted`,
   `commission.approved`, `payout.completed`, `contract_document.signed` and the rest of the
   events listed in `route.ts`).
5. It returns `200 {"received": true}`.
