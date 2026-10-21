# Shippo Webhooks - Express Example

Minimal example of receiving Shippo webhooks with `Shippo-Auth-Signature` HMAC verification, plus a URL-token fallback for accounts that don't have HMAC yet.

## Prerequisites

- Node.js 18+
- A Shippo account with a webhook, and either:
  - an **HMAC secret** provisioned by Shippo (ask your account manager for "HMAC Webhook Setup"; it can take up to 10 business days), or
  - a **self-generated token** appended to your webhook URL as `?token=…`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set one or both in `.env`:
   - `SHIPPO_WEBHOOK_SECRET`: when set, every request needs a valid `Shippo-Auth-Signature` header
   - `SHIPPO_WEBHOOK_TOKEN`: when set, every request needs a matching `?token=` query parameter

## Run

```bash
npm start
```

Server runs on http://localhost:3000, and the webhook endpoint is `POST /webhooks/shippo`.

## Test

```bash
npm test
```

The tests sign payloads with Shippo's algorithm, `hex(HMAC-SHA256(secret, "{t}.{raw body}"))`, and cover valid, tampered, and malformed signatures, old timestamps with the window off and on, the token mode, and every event type.

## How Verification Works

1. The handler reads the **raw** request body (`express.raw()`). It doesn't parse JSON before verifying.
2. It parses `t` and `v1` from `Shippo-Auth-Signature: t=<timestamp>,v1=<hex>`.
3. It computes `HMAC-SHA256(secret, "{t}.{body}")` as hex and compares it timing-safely.
4. The timestamp check is off by default, because retries and replays (including Hookdeck's) carry the original timestamp. Set `SHIPPO_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older timestamps. A value that isn't a whole number is treated as `0`, with a warning at startup.

Handled events: `track_updated`, `transaction_created`, `transaction_updated`, `batch_created`, `batch_purchased`, `automations_label_resolved`.

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 3000 shippo --path /webhooks/shippo
```

Add the printed URL (plus `?token=…` if you use a token) as a webhook in Shippo under **Settings → API → Webhooks**, then use the dashboard's test button to send a sample payload.
