# Circleback Webhooks - Express Example

Minimal example of receiving Circleback meeting webhooks with `x-signature`
verification (hex HMAC-SHA256 of the raw body).

Circleback has no SDK for verification, so this example verifies manually. The
route uses `express.raw({ type: '*/*' })` so the body stays raw bytes whatever
content type is sent.

## Prerequisites

- Node.js 18+
- A Circleback automation with a **Send webhook request** step and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the signing secret from the automation's webhook step to `.env` as `CIRCLEBACK_SIGNING_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/circleback`.

## Test

Run the test suite (signs payloads with the real Circleback algorithm):

```bash
npm test
```

### Receive real webhooks locally

```bash
# Forward webhooks to localhost (no install or account required)
npx hookdeck-cli listen 3000 circleback --path /webhooks/circleback
```

Use the URL the CLI prints as the endpoint in the automation's webhook step, then
send a test request for your most recent meeting.

## What the handler does

Circleback has no event types: every delivery is one meeting export (notes,
action items, attendees, and transcript or insights if enabled). The handler logs
the meeting name, link, attendees, notes, action items and transcript length.

| Status | When |
|--------|------|
| `200` | Signature valid, payload handled |
| `400` | Valid signature but the body is not JSON |
| `401` | Missing or invalid `x-signature` |
| `500` | `CIRCLEBACK_SIGNING_SECRET` not set, or the handler threw |

Circleback sends no delivery ID header, so deduplicate on the meeting `id`.
