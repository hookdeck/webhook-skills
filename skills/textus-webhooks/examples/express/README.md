# TextUs Webhooks - Express Example

Minimal example of receiving TextUs webhooks with signature verification
(`X-TextUs-Signature`, HMAC-SHA256 hex of the raw body).

## Prerequisites

- Node.js 18+
- A TextUs webhook with its secret (`textus-...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your TextUs webhook secret (the whole `textus-...` string) to `.env`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. The webhook endpoint is `POST /webhooks/textus`.

## Test

```bash
npm test
```

The tests generate real signatures with the same algorithm TextUs uses.

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel TextUs deliveries to your local server (no install,
no account required):

```bash
npx hookdeck-cli listen 3000 textus --path /webhooks/textus
```

Use the URL it prints as the webhook `baseUrl` in TextUs.

## Notes

- The body is read with `express.raw({ type: '*/*' })` so any content type verifies.
- Invalid or missing signatures return `401`; malformed JSON returns `400`.
