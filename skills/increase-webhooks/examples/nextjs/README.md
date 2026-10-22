# Increase Webhooks - Next.js Example

Minimal example of receiving Increase webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Increase account with an Event Subscription (its `shared_secret` is the signing secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Event Subscription's shared secret to `.env` (`INCREASE_WEBHOOK_SECRET`)

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

Increase uses the Standard Webhooks headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`), but the secret is the raw `shared_secret` string used as UTF-8 bytes, so the handler verifies manually instead of using the `standardwebhooks` library. The route reads the body with `request.text()`, so any content type verifies. The timestamp check is off by default because retries and replays keep the original timestamp; set `INCREASE_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 increase --path /webhooks/increase
```

Use the Hookdeck URL as the URL of an Event Subscription in Increase (in the dashboard, or `POST /event_subscriptions`). If you pick your own `shared_secret`, don't start it with `whsec_`.
