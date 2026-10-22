# Oyster Webhooks - Express Example

Minimal example of receiving Oyster (global HR / EOR) webhooks and authenticating them with
the `Authorization` bearer shared secret.

Oyster does not sign payloads. The only authentication is the `sharedSecret` you register,
which Oyster sends as `Authorization: Bearer <sharedSecret>`. The handler compares the
**whole header value**, including the `Bearer ` prefix, with a constant-time comparison.
That authenticates the sender, not the body, and gives no replay protection: use HTTPS,
dedupe on the event `id` and rotate the secret if it leaks.

## Prerequisites

- Node.js 18+
- An Oyster Developer Application and access token to register the endpoint (see
  [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `OYSTER_AUTHORIZATION` to `Bearer ` plus the `sharedSecret` you register.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/oyster`.

## Test

```bash
npm test
```

The tests send the documented envelope for `hiring.employment_engaged`,
`expenses.expense_approved`, `contract.change_applied` and `benefits.enrollment_enrolled` with
correct, wrong and missing `Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/oyster \
  -H "Content-Type: application/json" \
  -H "Authorization: $OYSTER_AUTHORIZATION" \
  -d '{"eventName":"expenses.expense_approved","eventTimestamp":"2026-04-21T09:35:13Z","id":"wh_01J19XRFZ2Q4QBDC6CA461AGT7","companyId":"ABC1234","data":{"expenseId":"exp_1"}}'
```

## Receive Oyster Webhooks Locally

```bash
npx hookdeck-cli listen 3000 oyster --path /webhooks/oyster
```

Register the printed URL as the `url` in `POST /v1/webhooks`.

## How It Works

- `src/index.js`: `verifyOysterRequest()` plus the `POST /webhooks/oyster` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type works.
2. `Authorization` is compared with `OYSTER_AUTHORIZATION`. Failure returns `401`.
3. The body must be a JSON object with a string `eventName` (`400` otherwise).
4. The handler switches on `eventName`; unknown events are logged and still get `200`.
5. It returns `200 {"received": true}` (Oyster requires a `200` within 5 seconds).
