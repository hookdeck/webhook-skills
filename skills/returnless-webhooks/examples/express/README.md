# Returnless Webhooks - Express Example

Minimal example of receiving Returnless webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Returnless webhook with its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Returnless webhook signing secret to `.env` as `RETURNLESS_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 returnless --path /webhooks/returnless
```

Use the URL the CLI prints as the endpoint in Returnless (Integrations -> Webhooks).

## Test

```bash
npm test
```

The tests sign requests with the same algorithm Returnless uses (lowercase hex HMAC-SHA256 of the raw body in `X-Signature`). The event name is read from the `X-Event-Name` header.
