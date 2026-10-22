# Taiga Webhooks - Express Example

Minimal example of receiving Taiga webhooks with signature verification (`X-TAIGA-WEBHOOK-SIGNATURE`, HMAC-SHA1).

## Prerequisites

- Node.js 18+
- A Taiga project with a webhook and its secret key (self-hosted: `WEBHOOKS_ENABLED = True`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook's secret key to `.env` as `TAIGA_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and receives webhooks at `POST /webhooks/taiga`.

The route uses `express.raw({ type: '*/*' })` so the signature is computed over the exact bytes received, whatever the `Content-Type`.

## Test

Run the automated tests (they generate real HMAC-SHA1 signatures):

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 taiga --path /webhooks/taiga
```

Put the printed URL in the webhook's URL field in Taiga, then use the webhook's test action.
