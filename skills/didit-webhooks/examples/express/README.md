# Didit Webhooks - Express Example

Minimal example of receiving Didit webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Didit account with a webhook destination (you need its `secret_shared_key`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the destination's `secret_shared_key` to `.env` as `DIDIT_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000, with the webhook endpoint at `POST /webhooks/didit`.

## Test

Run the automated tests (they generate real HMAC-SHA256 signatures):

```bash
npm test
```

To receive real webhooks locally, start a tunnel:

```bash
npx hookdeck-cli listen 3000 didit --path /webhooks/didit
```

Then, in Business Console > API & Webhooks, use **Try Webhook** to send a sample event to the tunnel URL.

## How verification works

- `X-Signature` is the hex HMAC-SHA256 of the exact raw request body, keyed with `secret_shared_key`
- `X-Timestamp` (unix seconds) is a separate header, not part of the signed input; the age check is off by default because Hookdeck retries and replays keep the original `X-Timestamp`; set `DIDIT_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds (Didit recommends `300`) to turn it on
- The route uses `express.raw({ type: '*/*' })` so the body is not parsed before verification
