# Absorb LMS Webhooks - Next.js Example

Minimal example of receiving Absorb LMS webhooks with the Next.js App Router and verifying the
`absorb-signature` header (HMAC-SHA256 of the raw body, lowercase hex).

## Prerequisites

- Node.js 18+
- An Absorb LMS portal where you are a System Administrator, with a saved webhook (its Secret
  Key is generated after saving; see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `ABSORB_WEBHOOK_SECRET` to the Secret Key shown on the saved webhook.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/absorb-lms`.

## Test

```bash
npm test
```

The tests sign payloads with the same algorithm Absorb uses and cover valid, tampered,
wrong-secret, random (Test Webhook style), malformed and missing signatures, any content type,
and the handled events. No Absorb account is needed.

**Absorb's Test Webhook button cannot be verified.** It sends a random signature instead of one
made with your Secret Key, so this route answers it with `401`. Trigger a real event in a
sandbox portal (for example create a user) to test end to end.

## Receive Absorb LMS Webhooks Locally

```bash
npx hookdeck-cli listen 3000 absorb-lms --path /webhooks/absorb-lms
```

Put the printed URL in the webhook's **URL** field in **Account > Client Settings**.

## How It Works

- `lib/verify-absorb.ts`: `verifyAbsorbSignature()`
- `app/webhooks/absorb-lms/route.ts`: the `POST` route handler

1. The route reads the exact bytes with `request.arrayBuffer()`, so the signature covers them
   whatever the content type.
2. The `absorb-signature` header must be exactly 64 hex characters; the helper computes the
   HMAC-SHA256 of the body with the Secret Key and compares in constant time (`401` on failure).
3. The body must be a JSON object (`400` otherwise).
4. The handler dispatches on `eventName` (`UserCreated`, `OnlineCourseActivated`,
   `EnrollmentCompletedbyAdmin`, `EnrollmentCompletedbyLearner`, `CertificateAwarded`,
   `CompetencyAwarded`, `CourseCreditsAwarded`, `UserEnrolledinCoursebyAdmin`,
   `UserEnrolledinCoursebyLearner`) and returns `200 {"received": true}`.
