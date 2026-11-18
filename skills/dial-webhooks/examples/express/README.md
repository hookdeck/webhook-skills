# Dial Webhooks - Express Example

Minimal example of receiving Dial webhooks with signature verification.

Dial has no published webhook verification SDK, so this example verifies the
`X-Dial-Signature` header (`t=<unix-seconds>,v1=<hex>`, HMAC-SHA256 of `{t}.{raw body}`
keyed with the full `whsec_` secret) manually with Node's built-in `crypto`. The body is
read with `express.raw({ type: '*/*' })` so any content type verifies.

## Prerequisites

- Node.js 18+
- A Dial webhook subscription and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the full signing secret (including `whsec_`) to `.env` as `DIAL_WEBHOOK_SECRET`.
   Get it from the dashboard or `GET https://api.getdial.ai/api/v1/webhooks/{id}/secret`.

The timestamp check is off by default, because Hookdeck retries and replays keep the
original signed timestamp. To turn it on for direct delivery, set
`DIAL_WEBHOOK_TOLERANCE_SECONDS` (e.g. `300`, Dial's suggested 5 minutes).

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To send a real signed delivery, click **Fire ping** on the dashboard Webhooks page or
call `POST https://api.getdial.ai/api/v1/webhooks/{id}/ping` (fires `webhook.ping`).

## Endpoints

- `POST /webhooks/dial` - Receives and verifies Dial webhooks
- `GET /health` - Health check

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 3000 dial --path /webhooks/dial
```

Use the printed HTTPS URL as the subscription's `targetUrl`.
