# Rewardful Webhooks - Express Example

Minimal example of receiving Rewardful webhooks with signature verification.

Rewardful sends `X-Rewardful-Signature`: the lowercase hex HMAC-SHA256 of the raw request body,
keyed with the endpoint's Signing Secret. Rewardful has no Node verification helper, so the
handler verifies manually. The route reads the body with `express.raw({ type: '*/*' })`, so any
content type works and the exact bytes are verified, and parses it only after the check.

## Prerequisites

- Node.js 18+
- A Rewardful account with an endpoint and its Signing Secret (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `REWARDFUL_WEBHOOK_SECRET` in `.env` to the endpoint's Signing Secret from the Webhooks
   page in the Rewardful dashboard.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/rewardful`.

## Test

```bash
npm test
```

The tests sign the documented `affiliate.confirmed` payload and every handled event with the same
algorithm as Rewardful, and cover wrong, missing, malformed and tampered signatures. No Rewardful
account is needed.

To try it by hand:

```bash
BODY='{"object":{"id":"1"},"event":{"id":"e1","type":"affiliate.confirmed","api_version":"v1"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$REWARDFUL_WEBHOOK_SECRET" -hex | awk '{print $NF}')
curl -X POST http://localhost:3000/webhooks/rewardful \
  -H "Content-Type: application/json" -H "X-Rewardful-Signature: $SIG" -d "$BODY"
```

## Receive Webhooks Locally

Rewardful can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 rewardful --path /webhooks/rewardful
```

Put the printed URL in the endpoint's URL field on the Rewardful Webhooks page.

## How It Works

- `src/index.js`: `verifyRewardfulSignature()` plus the `POST /webhooks/rewardful` route

1. The raw body bytes and `X-Rewardful-Signature` are checked first. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. A repeated `event.id` is acknowledged with `200` and skipped.
4. The handler dispatches on `event.type` (`affiliate.created`, `affiliate.confirmed`,
   `referral.lead`, `referral.converted`, `sale.created`, `sale.refunded`, `commission.created`,
   `commission.paid`, `payout.due`, `payout.paid`, `payout.failed`) and logs the rest.
5. It returns `200 {"received": true}`; Rewardful treats any other status as a failure and retries.
