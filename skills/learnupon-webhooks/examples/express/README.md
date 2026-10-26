# LearnUpon Webhooks - Express Example

Minimal example of receiving LearnUpon webhooks (version 2.0) with signature verification.

Only Webhooks v2.0 are supported. Ask LearnUpon support to turn them on.

LearnUpon signs the raw body with HMAC-SHA256 and sends the hex digest in `X-Webhook-Signature`. The
route reads the body with `express.raw({ type: '*/*' })` so the exact bytes are verified, whatever the
content type, and parses JSON only after the check.

## Prerequisites

- Node.js 18+
- A LearnUpon portal with webhooks enabled and a webhook secret (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `LEARNUPON_WEBHOOK_SECRET` in `.env` to the secret from your LearnUpon webhook configuration.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/learnupon`.

## Test

```bash
npm test
```

The tests cover LearnUpon's published test vector, valid and invalid signatures, every v2.0 event
type, batched `data` arrays and duplicate deliveries. No LearnUpon account is needed.

To try it by hand, sign a body with your secret:

```bash
BODY='{"data":[{"eventCreated":"2023-12-14T19:41:35.463Z","user":{"userId":285900,"email":"bella.bell@yourdomain.com","username":null},"enrollmentId":18976600,"courseId":2712800}]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$LEARNUPON_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST http://localhost:3000/webhooks/learnupon \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Type: course_enrollment" \
  -H "X-Webhook-ID: test-1" \
  -H "X-Webhook-Signature: $SIG" \
  -d "$BODY"
```

## Receive Webhooks Locally

LearnUpon can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 learnupon --path /webhooks/learnupon
```

Put the printed URL in your LearnUpon webhook configuration.

## How It Works

- `src/index.js`: `verifyLearnuponSignature()` plus the `POST /webhooks/learnupon` route

1. The signature is verified over the raw body. Missing, malformed or wrong: `401`.
2. The body must be `{"data": [...]}` and `X-Webhook-Type` must be present (`400` otherwise).
3. Repeated `X-Webhook-ID`s (LearnUpon resends failed webhooks) are acknowledged without reprocessing.
4. The handler loops over `data` (up to 10 events of one type) and dispatches on `X-Webhook-Type`.
5. It returns `200 {"received": true}`. LearnUpon expects a `2xx` within about 2 seconds.

No timestamp is signed, so there is no replay window to check; dedupe on `X-Webhook-ID` instead.
