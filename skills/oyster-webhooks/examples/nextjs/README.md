# Oyster Webhooks - Next.js Example

Minimal example of receiving Oyster (global HR / EOR) webhooks with the Next.js App Router and
authenticating them with the `Authorization` bearer shared secret.

Oyster does not sign payloads. The only authentication is the `sharedSecret` you register,
which Oyster sends as `Authorization: Bearer <sharedSecret>`. The route compares the **whole
header value**, including the `Bearer ` prefix, with a constant-time comparison. That
authenticates the sender, not the body, and gives no replay protection: use HTTPS, dedupe on
the event `id` and rotate the secret if it leaks.

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
   cp .env.example .env.local
   ```

3. Set `OYSTER_AUTHORIZATION` to `Bearer ` plus the `sharedSecret` you register.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/oyster`.

## Test

```bash
npm test
```

The tests send the documented envelope for `hiring.employment_engaged`,
`expenses.expense_approved`, `contract.change_applied` and `benefits.enrollment_enrolled` with
correct, wrong and missing `Authorization` headers.

## Receive Oyster Webhooks Locally

```bash
npx hookdeck-cli listen 3000 oyster --path /webhooks/oyster
```

Register the printed URL as the `url` in `POST /v1/webhooks`.

## How It Works

- `lib/verify-oyster.ts`: `verifyOysterRequest()`, a constant-time compare of the full header
- `app/webhooks/oyster/route.ts`: the `POST` handler

1. `Authorization` is compared with `OYSTER_AUTHORIZATION` before the body is read. Failure
   returns `401`.
2. The body is read as raw text (`request.text()`), so any content type works, then parsed.
3. It must be a JSON object with a string `eventName` (`400` otherwise).
4. The handler switches on `eventName`; unknown events are logged and still get `200`.
