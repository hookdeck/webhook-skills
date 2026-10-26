# Dentally Webhooks - Next.js Example

Minimal example of receiving Dentally webhooks with signature verification (`X-Dentally-Signature`, HMAC-SHA256 hex of the raw body) using the App Router.

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
   cp .env.example .env.local
   ```

3. Set `DENTALLY_WEBHOOK_SECRET` in `.env.local` to the secret you set on the Dentally webhook

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The webhook endpoint is `POST /webhooks/dentally`.

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

- The route reads the body with `await request.text()` so the signature is checked over the exact bytes sent.
- Unknown events return `204 No Content`, as Dentally recommends.
- Invalid signatures return `401`; each non-2xx counts toward Dentally's 50-failure auto-disable limit.
