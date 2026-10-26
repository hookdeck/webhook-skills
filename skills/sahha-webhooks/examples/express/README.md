# Sahha Webhooks - Express Example

Minimal Express example of receiving [Sahha](https://sahha.ai) webhooks with `X-Signature` verification (hex HMAC-SHA256 of the raw body).

## Prerequisites

- Node.js 18+
- A Sahha account with a webhook endpoint configured on the **Webhooks** page of the [Sahha Dashboard](https://app.sahha.ai/dashboard/webhooks) and its secret key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the Dashboard secret key in `SAHHA_WEBHOOK_SECRET`. It is used as-is (UTF-8 bytes) as the HMAC key.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/sahha`.

## Test

```bash
npm test
```

The tests sign payloads the way Sahha does and cover all five event types, uppercase hex, tampered and re-serialized bodies, wrong secrets, malformed signatures, non-object JSON, wrong-typed fields, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 sahha --path /webhooks/sahha
```

Add the printed URL as the endpoint on the Dashboard **Webhooks** page, pick event types, then use **Send Test Event**.

## Notes

- The route uses `express.raw({ type: '*/*' })`, so any content type works and the signature covers the exact bytes. Do not put `express.json()` before it.
- A missing, empty or malformed `X-Signature`, or a mismatch, returns `401`. Only the body is signed, so there is no timestamp or replay window to check.
- If `SAHHA_WEBHOOK_SECRET` is unset the handler returns `500` and never accepts unverified requests.
- The event type comes from the `X-Event-Type` header (`ScoreCreatedIntegrationEvent`, `BiomarkerCreatedIntegrationEvent`, `ArchetypeCreatedIntegrationEvent`, `TagReceivedIntegrationEvent`, `DataLogReceivedIntegrationEvent`). Unknown types are logged and acknowledged.
- Sahha needs a `2xx` within **30 seconds**, retries failed deliveries up to 5 times with exponential backoff, and may deliver out of order. Make handlers idempotent and enqueue heavy work.
