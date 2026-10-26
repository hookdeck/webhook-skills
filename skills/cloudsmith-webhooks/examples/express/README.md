# Cloudsmith Webhooks - Express Example

Minimal example of receiving Cloudsmith webhooks with signature verification (`X-Cloudsmith-Signature`, HMAC-SHA1).

## Prerequisites

- Node.js 18+
- A Cloudsmith repository webhook with an HMAC signature key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook's HMAC signature key to `.env` as `CLOUDSMITH_WEBHOOK_SECRET`

Set an HMAC signature key on the Cloudsmith webhook. Without one, deliveries are unsigned and fail verification.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and receives webhooks at `POST /webhooks/cloudsmith`.

The route uses `express.raw({ type: '*/*' })` so the signature is computed over the exact bytes received, whatever the `Content-Type`. Leave the webhook's payload format on the default JSON object (or JSON array); form-encoded and template payloads are verified but then rejected with 400 because the handler expects JSON.

## Test

Run the automated tests (they generate real HMAC-SHA1 signatures):

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 cloudsmith --path /webhooks/cloudsmith
```

Put the printed URL in the webhook's Payload URL field in Cloudsmith, then send a `ping` from the webhook's page.
