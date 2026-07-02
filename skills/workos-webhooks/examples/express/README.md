# WorkOS Webhooks - Express Example

Minimal example of receiving WorkOS webhooks with signature verification using
Express and the official `@workos-inc/node` SDK.

## Prerequisites

- Node.js 18+
- WorkOS account with a webhook endpoint signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your WorkOS API key and webhook signing secret to `.env`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the test suite (generates real WorkOS signatures):

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel WorkOS events to your local server (no account
required):

```bash
npx hookdeck-cli listen 3000 workos --path /webhooks/workos
```

Set the WorkOS Dashboard webhook endpoint URL to the tunnel URL the CLI prints.

## How It Works

- The route uses `express.raw({ type: 'application/json' })` so the **raw body**
  is available for verification — parsing first would break the HMAC.
- `workos.webhooks.constructEvent({ payload, sigHeader, secret })` verifies the
  `WorkOS-Signature` header and returns the parsed `Event`.
- The event type is on `event.event`; the object is on `event.data`.

## Endpoint

- `POST /webhooks/workos` - Receives and verifies WorkOS webhook events
- `GET /health` - Health check
