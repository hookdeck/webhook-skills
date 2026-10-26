# Greenshades Webhooks - Express Example

Minimal example of receiving Greenshades webhooks and verifying the `X-GS-SIGNATURE` header (hex HMAC-SHA256 of `X-GS-TIMESTAMP`, a newline, then the raw body).

## Prerequisites

- Node.js 18+
- Greenshades API access with the `GO.Api.WEBHOOK.write` (or `full_access`) scope, and a webhook subscription created with an `hmacKey` you chose

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the `hmacKey` you used when creating the subscription in `.env` as `GREENSHADES_WEBHOOK_SECRET`. It is used as-is, as UTF-8 bytes.

4. Optional: set `GREENSHADES_WEBHOOK_TOLERANCE_SECONDS` to reject old `X-GS-TIMESTAMP` values. It is off by default because Hookdeck retries and replays resend the original timestamp.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To receive real Greenshades deliveries locally, use the Hookdeck CLI (no install or account needed):

```bash
npx hookdeck-cli listen 3000 greenshades --path /webhooks/greenshades
```

Use the URL it prints as the `url` of your webhook subscription.

## Endpoint

`GET`, `POST`, `PUT`, `PATCH` and `DELETE` `/webhooks/greenshades`. Greenshades' docs don't name the HTTP method, and Hookdeck's Greenshades source pre-selects POST without managing it, so the example verifies every method. The raw body is read for any content type and verified before it is parsed. The event-name field in the delivery body is not documented, so `getEventName` / `get_event_name` reads it defensively; check a real delivery and adjust.

Responses: `200` verified, `400` verified but not JSON, `401` missing or invalid signature or timestamp, `500` secret not configured.
