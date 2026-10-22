# Mercury Webhooks - Next.js Example

Minimal example of receiving Mercury webhooks with `Mercury-Signature` verification.

## Prerequisites

- Node.js 18+
- Mercury account with API access, and a webhook endpoint created through the API (`POST /webhooks`) so you have its `secretKey`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the endpoint's `secretKey` to `.env` (`MERCURY_WEBHOOK_SECRET`). Mercury returns it only when the endpoint is created.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

The route reads the raw body with `request.text()`, verifies `Mercury-Signature` (`t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`), then dispatches on `` `${resourceType}.${operationType}` `` (for example `transaction.create`). The timestamp check is off by default because retries and replays keep the original timestamp; set `MERCURY_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 mercury --path /webhooks/mercury
```

Use the Hookdeck URL as the `url` when you create the endpoint with `POST https://api.mercury.com/api/v1/webhooks`. Then call `POST /webhooks/{id}/verify` to send a test `transaction.created` event.
