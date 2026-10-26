# Column Webhooks - Next.js Example

Minimal example of receiving Column webhooks with `Column-Signature` verification.

## Prerequisites

- Node.js 18+
- Column account with a webhook endpoint and its signing secret (Dashboard → Webhook settings)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the endpoint's signing secret to `.env` (`COLUMN_WEBHOOK_SECRET`).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

The handler reads the raw bytes with `await request.arrayBuffer()`, verifies `Column-Signature` (lowercase hex HMAC-SHA256 of the raw body, keyed with the signing secret), then dispatches on the payload `type` (`ach.outgoing_transfer.completed`, `ach.outgoing_transfer.returned`, `book.transfer.completed`) and logs the rest. No timestamp is signed, so there is no replay window; dedupe on the event `id`.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 column --path /webhooks/column
```

Use the Hookdeck URL as the endpoint URL when you create the webhook in Column, then trigger a transfer in the sandbox.
