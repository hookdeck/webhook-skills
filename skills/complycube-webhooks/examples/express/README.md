# ComplyCube Webhooks - Express Example

Minimal example of receiving ComplyCube webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A ComplyCube account and a webhook endpoint (its secret is shown once, at creation)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
3. Add your webhook secret to `.env` as `COMPLYCUBE_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 complycube --path /webhooks/complycube
```

Then register the Hookdeck URL as a webhook endpoint in ComplyCube (it must be HTTPS). The handler
reads the body with `express.raw({ type: '*/*' })` so the signature covers the exact bytes received.
