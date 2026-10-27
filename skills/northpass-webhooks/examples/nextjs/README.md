# Northpass Webhooks - Next.js Example

Minimal example of receiving Northpass webhooks with signature verification in the App Router.

Northpass sends `X-Northpass-Hmac-SHA256`: the padded base64 HMAC-SHA256 of the **raw request
body**, keyed with your school's shared secret. The route reads the exact bytes with
`await request.arrayBuffer()`, validates the header format (44 characters, standard base64),
compares it in constant time (`lib/verify-northpass.ts`), and only then parses the JSON. Nothing
else is signed, so there is no timestamp or replay window to check.

## Prerequisites

- Node.js 18+
- A Northpass school on a plan with the Webhooks app (Premium), and its shared secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put your school's shared secret (shown in the Webhooks app) in `.env.local` as
   `NORTHPASS_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts `POST /webhooks/northpass`.

## Test

```bash
npm test
```

The tests sign each documented event type with the same algorithm Northpass documents. No
Northpass account is needed.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 northpass --path /webhooks/northpass
```

Give the printed URL to the Northpass Webhooks app as the endpoint.

## How It Works

- `app/webhooks/northpass/route.ts`: the `POST` handler and event dispatch on `data.type`
- `lib/verify-northpass.ts`: `verifyNorthpassSignature()`

1. Missing, malformed or mismatched signature: `401`.
2. The body must be JSON with a `data` object (`400` otherwise).
3. Events whose `data.id` was already handled are acknowledged without reprocessing.
4. Handled types: `learner_created_events`, `person_activated_events`,
   `learner_enrolled_to_course_events`, `learner_started_course_events`,
   `course_completed_events`, `quiz_completed_events`, `course_published_events`. Other documented
   types are logged.
5. It returns `200 {"received": true}`. Northpass retries failed deliveries hourly for 24 hours and
   then disables all of the school's webhooks, so keep the endpoint healthy.
