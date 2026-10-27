# WHOOP Webhooks - Express Example

Minimal example of receiving WHOOP webhooks with `X-WHOOP-Signature` verification.

## Prerequisites

- Node.js 18+
- A WHOOP app in the [WHOOP Developer Dashboard](https://developer-dashboard.whoop.com/)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your WHOOP app's client secret to `.env` as `WHOOP_WEBHOOK_SECRET`. WHOOP signs webhooks with it; there is no separate webhook secret.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and receives `POST /webhooks/whoop`.

## Test

```bash
npm test
```

The tests generate real signatures (`base64(HMAC-SHA256(secret, timestamp + rawBody))`).

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 whoop --path /webhooks/whoop
```

Set the printed Hookdeck URL as the Webhook URL on your app in the WHOOP Developer Dashboard.

## Notes

- The handler reads the body with `express.raw({ type: '*/*' })` so the exact bytes are verified, then parses JSON.
- Old timestamps are accepted by default. Set `WHOOP_WEBHOOK_TOLERANCE_SECONDS` to opt in to a window (the timestamp is Unix milliseconds).
