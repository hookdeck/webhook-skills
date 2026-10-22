# SavvyCal Webhooks - Express Example

Minimal example of receiving SavvyCal webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A SavvyCal webhook with its secret (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your SavvyCal webhook secret to `.env` as `SAVVYCAL_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the test suite (generates real signatures and verifies the endpoint):

```bash
npm test
```

### Receive live webhooks locally

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 savvycal --path /webhooks/savvycal
```

Point your SavvyCal webhook at the tunnel URL, then book, reschedule, or cancel a
meeting to trigger `event.created`, `event.rescheduled`, and `event.canceled`.

## How It Works

- Uses `express.raw({ type: '*/*' })` so verification runs against the **raw** body whatever the content type.
- Reads the `x-savvycal-signature` header.
- Computes HMAC-SHA256 (hex) of the raw body with the webhook secret.
- Strips an optional `sha256=` prefix and compares the hex case-insensitively, timing-safe.

## Endpoint

- `POST /webhooks/savvycal` - Receives and verifies SavvyCal webhook events
- `GET /health` - Health check
