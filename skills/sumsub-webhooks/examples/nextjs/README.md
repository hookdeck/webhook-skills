# Sumsub Webhooks - Next.js Example

Minimal example of receiving Sumsub webhooks with `x-payload-digest` verification. The HMAC algorithm (SHA1, SHA256 or SHA512) is read from the `x-payload-digest-alg` header on every delivery.

## Prerequisites

- Node.js 20.9+
- A Sumsub account with a webhook in **Dev space → Webhooks → Webhook manager** and its **Secret key** (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook's secret key to `.env` as `SUMSUB_WEBHOOK_SECRET`, exactly as shown in the Webhook manager.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000.

## Test

### Run unit tests

```bash
npm test
```

The tests sign payloads with the real algorithm (hex HMAC of the raw body), check fixed known-answer digests for all three algorithms, and cover a missing or unknown `x-payload-digest-alg`, tampered and re-serialised bodies, and each handled event type.

The route handler is in `app/webhooks/sumsub/route.ts`; the digest check is in `lib/verify-sumsub.ts`.

### Forward live events with the Hookdeck CLI

```bash
# No account required — first run prints a public URL
npx hookdeck-cli listen 3000 sumsub --path /webhooks/sumsub
```

Use the printed HTTPS URL as the webhook **Target** in the Webhook manager, then click **Test webhook**. Test deliveries are signed like real ones and carry `"testMode": true` in the body.

## Endpoint

- `POST /webhooks/sumsub`: verifies `x-payload-digest` against the raw body (400 on failure) and routes on the body's `type` (`applicantCreated`, `applicantPending`, `applicantReviewed`, `applicantOnHold`, `applicantActionPending`, `applicantActionReviewed`, `applicantReset`, `applicantDeleted`).
- `GET /health`: liveness probe.
