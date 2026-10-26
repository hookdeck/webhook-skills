# Campfire Webhooks - Express Example

Minimal example of receiving [Campfire](https://campfire.ai) (the AI accounting / ERP platform) webhooks with signature verification.

> **Not 37signals' Campfire chat.** This is campfire.ai (app.meetcampfire.com).

## How Verification Works

- Header `Campfire-Webhook-Signature-v1`: bare lowercase **hex** HMAC-SHA256 (no prefix)
- Signed message: `{Campfire-Webhook-Request-Timestamp}:{raw request body}`, joined by a **colon**
- Key: the webhook's 50-character signing secret, used as UTF-8 text (not decoded)
- Invalid, missing or mismatched signature: `401`

## Prerequisites

- Node.js 18+
- A Campfire admin user and a webhook (Settings > Developer > Webhooks) with its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CAMPFIRE_WEBHOOK_SECRET` in `.env` to the webhook's signing secret (the `token` field, or **Show** on the webhook card).

Optional: set `CAMPFIRE_WEBHOOK_TOLERANCE_SECONDS` (for example `300`) to reject deliveries with an old timestamp. It is off by default, because Hookdeck retries and replays resend the original timestamp.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. The endpoint is `POST /webhooks/campfire`.

## Test

Run the automated tests (they sign requests with the same algorithm Campfire uses):

```bash
npm test
```

To receive real deliveries locally, use the Hookdeck CLI (no account or install required):

```bash
npx hookdeck-cli listen 3000 campfire --path /webhooks/campfire
```

Paste the printed URL into the webhook's URL field in Campfire. Each delivery's headers, body and computed signature are also visible under **Recent Events** on the Webhooks settings page.

## Handled Topics

`Invoice.created`, `Invoice.payment`, `Invoice.paid`, `Invoice.deleted`, `Bill.created`, `Bill.paid`, `Bill.deleted`, `JournalEntry.created`. Every other topic is logged and acknowledged.

## Raw Body

The route uses `express.raw({ type: '*/*' })` so the exact bytes are verified whatever the content type. The JSON is parsed only after the signature check.
