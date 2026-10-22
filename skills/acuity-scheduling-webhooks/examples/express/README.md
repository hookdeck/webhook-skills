# Acuity Scheduling Webhooks - Express Example

Minimal example of receiving Acuity Scheduling webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Acuity Scheduling account and API key (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Acuity API key to `.env` as `ACUITY_API_KEY`. Acuity signs webhooks with the API key
   (the main admin's key for static webhooks), not a separate webhook secret.

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
npx hookdeck-cli listen 3000 acuity-scheduling --path /webhooks/acuity-scheduling
```

Point the Acuity Webhook integration (or a dynamic webhook `target`) at the tunnel URL, then book,
reschedule or cancel an appointment to trigger `scheduled`, `rescheduled` and `canceled`.

## How It Works

- Uses `express.raw({ type: '*/*' })` so verification runs on the **raw** body for any content type.
- Reads the `X-Acuity-Signature` header.
- Computes base64 HMAC-SHA256 of the raw body keyed with `ACUITY_API_KEY`, compared timing-safe.
- Only after verification, parses the form-encoded body (`action`, `id`, `calendarID`, `appointmentTypeID`).

## Endpoint

- `POST /webhooks/acuity-scheduling` - Receives and verifies Acuity Scheduling webhook events
- `GET /health` - Health check
