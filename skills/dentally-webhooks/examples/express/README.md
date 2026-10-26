# Dentally Webhooks - Express Example

Minimal example of receiving Dentally webhooks with signature verification (`X-Dentally-Signature`, HMAC-SHA256 hex of the raw body).

## Prerequisites

- Node.js 18+
- A Dentally webhook endpoint with a secret string you chose

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `DENTALLY_WEBHOOK_SECRET` in `.env` to the secret you set on the Dentally webhook

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

To receive real webhooks locally, run the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 dentally --path /webhooks/dentally
```

Then create a Dentally webhook pointing at the URL it prints.

## Notes

- The route uses `express.raw({ type: '*/*' })` so the raw bytes are verified whatever `Content-Type` is sent.
- Unknown events return `204 No Content`, as Dentally recommends.
- Invalid signatures return `401`; each non-2xx counts toward Dentally's 50-failure auto-disable limit.
