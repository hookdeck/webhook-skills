# Helius Webhooks - Next.js Example

Minimal example of receiving Helius webhooks and checking the `Authorization` header in the Next.js App Router (Helius does not sign payloads).

## Prerequisites

- Node.js 18+
- Helius account with a webhook whose `authHeader` you chose

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `HELIUS_AUTH_HEADER` in `.env.local` to the exact `authHeader` value you registered on the Helius webhook (for example `Bearer your-secret-token`).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 helius --path /webhooks/helius
```

Use the Hookdeck URL as the webhook URL in Helius, and set the authentication header there.

## Test

```bash
npm test
```

Or send a request by hand:

```bash
curl -X POST http://localhost:3000/webhooks/helius \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '[{"type":"TRANSFER","signature":"abc123","description":"test transfer"}]'
```

## Endpoint

- `POST /webhooks/helius`: `200` accepted, `401` bad or missing `Authorization`, `400` invalid JSON, `500` secret not configured

## Project Structure

```
app/webhooks/helius/route.ts   # Webhook handler
lib/helius.ts                  # Authorization header check + de-duplication set
```
