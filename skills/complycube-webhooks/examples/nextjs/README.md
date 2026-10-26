# ComplyCube Webhooks - Next.js Example

Minimal example of receiving ComplyCube webhooks with signature verification (App Router).

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
   cp .env.example .env.local
   ```
3. Add your webhook secret to `.env.local` as `COMPLYCUBE_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The route is `POST /webhooks/complycube`.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 complycube --path /webhooks/complycube
```

Then register the Hookdeck URL as a webhook endpoint in ComplyCube (it must be HTTPS). The route reads
`await request.arrayBuffer()` so the signature covers the exact bytes received.
