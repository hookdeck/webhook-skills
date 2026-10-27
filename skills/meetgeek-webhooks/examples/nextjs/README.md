# MeetGeek Webhooks - Next.js Example

Minimal example of receiving MeetGeek webhooks with `X-MG-Signature` verification (App Router).

## Prerequisites

- Node.js 18+
- A MeetGeek account with the Public API webhook secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```
3. Add the webhook secret configured for the MeetGeek Public API to `.env.local`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The route is `app/webhooks/meetgeek/route.ts`.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 meetgeek --path /webhooks/meetgeek
```

The route reads the raw bytes with `request.arrayBuffer()`, verifies the signature, then branches on `meeting_id`: present means `successful-analysis`, absent means `failed-analysis`.
