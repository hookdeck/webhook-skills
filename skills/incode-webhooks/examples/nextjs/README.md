# Incode Webhooks - Next.js Example

Minimal example of receiving Incode webhooks and authenticating them with the custom header
you add in Dashboard > Configuration > Webhooks.

Incode does not sign payloads, so there is no HMAC to verify. The handler looks up the header
named in `INCODE_WEBHOOK_HEADER` (default `Authorization`, case-insensitive) and compares its
whole value with `INCODE_WEBHOOK_SECRET` in constant time. A missing header or a mismatch
returns `401`. The body is read raw so any content type works, and is parsed only after the
check. Success answers `200` with a JSON body, which Incode requires to stop retrying.

A static header authenticates the sender, not the body, and gives no replay protection. Use
HTTPS and rotate the value if it leaks. Incode's OIDC/OAuth option is not covered.

## Prerequisites

- Node.js 18+
- An Incode account with a custom header configured (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `INCODE_WEBHOOK_HEADER` to the Custom Header Key and `INCODE_WEBHOOK_SECRET` to the exact
   Custom Header Value from Dashboard > Configuration > Webhooks.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/incode`.

## Test

```bash
npm test
```

The tests send every documented event (`event_type`, `eventType` and `onboardingStatus`
payloads) with correct, wrong and missing header values. No Incode account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/incode \
  -H "Content-Type: application/json" \
  -H "$INCODE_WEBHOOK_HEADER: $INCODE_WEBHOOK_SECRET" \
  -d '{"event_type":"SESSION_SUCCEEDED","interviewId":"664283755e0f8e1b87fcc2ce"}'
```

## Receive Webhooks Locally

Incode can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 incode --path /webhooks/incode
```

Put the printed URL in the webhook configuration in Incode.

## How It Works

- `lib/verify-incode.ts and app/webhooks/incode/route.ts`

1. The custom header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler reads `event_type`, then `eventType`, then `onboardingStatus` and dispatches on
   it: `SESSION_STARTED`, `SESSION_PROGRESS`, `SESSION_SUCCEEDED`, `SESSION_FAILED`,
   `SESSION_PENDING_REVIEW`, `IDENTITY_ENROLLED`, `ID_VALIDATION_FINISHED`,
   `ID_VALIDATION_FINISHED_SECOND_ID`, `GOVERNMENT_VALIDATION_FINISHED`,
   `FACE_VALIDATION_FINISHED`, `POST_PROCESSING_FINISHED`, `POST_PROCESSING_FINISHED_SECOND_ID`,
   `ONBOARDING_FINISHED`, `MANUAL_REVIEW_APPROVED`, `MANUAL_REVIEW_REJECTED`, `EXPIRED`,
   `DELETED`.
4. It returns `200 {"success": true}` as JSON.
