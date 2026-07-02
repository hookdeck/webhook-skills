# Klaviyo Webhooks - Express Example

Minimal example of receiving Klaviyo system webhooks with HMAC-SHA256 signature
verification using Express.

## Prerequisites

- Node.js 18+
- A Klaviyo webhook with an endpoint secret (min 16 chars)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Klaviyo endpoint secret to `.env` as `KLAVIYO_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real signatures):

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Klaviyo deliveries to your local server (no account
required):

```bash
npx hookdeck-cli listen 3000 klaviyo --path /webhooks/klaviyo
```

Then trigger a subscribed event in Klaviyo (e.g. open a test email).

## How It Works

- The route uses `express.raw()` so the raw body is available for signature
  verification — Klaviyo signs `rawBody + Klaviyo-Timestamp` with HMAC-SHA256 (hex).
- The `Klaviyo-Signature` header is compared timing-safe against the computed HMAC.
- After verification, the handler iterates over the batched `data` array and
  dispatches each event by its `topic`.

## Endpoint

- `POST /webhooks/klaviyo` - Receives and verifies Klaviyo webhook events
- `GET /health` - Health check
