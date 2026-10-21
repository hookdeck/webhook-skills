# Maxio Webhooks - Next.js Example

Minimal example of receiving Maxio (Chargify) webhooks with signature verification, using the App Router.

## Prerequisites

- Node.js 18+
- Maxio site with a Site Shared Key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Site Shared Key to `.env.local` as `MAXIO_SHARED_KEY`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 (webhook route: `/webhooks/maxio`).

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 maxio --path /webhooks/maxio
```

Use the URL the CLI prints as your webhook endpoint in Maxio, then send a `test` event.

## Test

```bash
npm test
```
