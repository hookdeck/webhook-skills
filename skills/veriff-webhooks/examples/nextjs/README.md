# Veriff Webhooks - Next.js Example

Minimal example of receiving Veriff webhooks (decision and event webhooks) in the Next.js
App Router with `X-HMAC-SIGNATURE` verification. Veriff has no webhook-verification SDK, so
the HMAC-SHA256 check is implemented manually with Node's `crypto` (`lib/veriff.ts`).

## Prerequisites

- Node.js 18+
- A Veriff account with an integration and its **shared secret key**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your integration's shared secret key to `.env` as `VERIFF_SHARED_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/veriff
```

## Test

```bash
npm test
```

The tests sign request bodies with the same algorithm Veriff uses (hex HMAC-SHA256 of
the raw body) and include the test vector published in Veriff's docs.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 veriff --path /webhooks/veriff
```

1. In the Veriff Customer Portal, open **Integrations** → your integration → **Settings**.
2. Paste the tunnel URL into **Webhook decisions URL** (and **Webhook events URL** if you want event webhooks).
3. Start a test verification session and finish the flow to receive a decision webhook.

## Event Handling

Decision webhooks (`verification.status`):

- `approved`, `declined`, `resubmission_requested`, `review`, `expired`, `abandoned`

Event webhooks (`action`):

- `started`, `submitted`, `waiting_complete`, `waiting_continued`, `flow_finished`, `flow_cancelled`, `document_type_other_selected`

Respond `200` within 5 seconds. Veriff retries failed deliveries for up to a week and delivers at least once, so make your handler idempotent.
