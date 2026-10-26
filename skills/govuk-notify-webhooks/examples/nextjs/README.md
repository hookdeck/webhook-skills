# GOV.UK Notify Webhooks - Next.js Example

Minimal example of receiving GOV.UK Notify callbacks and authenticating them with the
`Authorization: Bearer` token.

Notify does not sign callbacks, so there is no HMAC to verify. The handler requires the
`Authorization` header to start with `Bearer ` (matched case-insensitively) and compares the rest
with your token in constant time. The route reads the body with `request.text()`, so any content type works.

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Use HTTPS and rotate the token if it leaks.

## Prerequisites

- Node.js 20+
- A GOV.UK Notify service with a callback configured (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `GOVUK_NOTIFY_WEBHOOK_SECRET` to the bare bearer token you set for the callback in
   GOV.UK Notify (API integration > Callbacks).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/govuk-notify`.

## Test

```bash
npm test
```

The tests send delivery receipts, received text messages and returned letters (built from the
documented field tables) with correct, wrong and missing tokens. No Notify account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/govuk-notify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GOVUK_NOTIFY_WEBHOOK_SECRET" \
  -d '{"id":"740e5834-3a29-46b4-9a6f-16142fde533a","reference":"12345678","to":"hello@gov.uk","status":"delivered","notification_type":"email","template_version":1}'
```

## Receive Webhooks Locally

Notify can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 govuk-notify --path /webhooks/govuk-notify
```

Put the printed URL in the Notify callback settings.

## How It Works

- `lib/verify-govuk-notify.ts`: `verifyNotifyRequest()`
- `app/webhooks/govuk-notify/route.ts`: the `POST /webhooks/govuk-notify` route

1. The `Authorization` header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. There is no `event` field, so the handler classifies the callback by shape: delivery receipt
   (`status` + `notification_type`), received text message (`source_number` +
   `destination_number`) or returned letter (`notification_id` + `date_sent`).
4. It returns `200 {"received": true}`.
