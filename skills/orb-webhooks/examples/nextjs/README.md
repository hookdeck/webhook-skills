# Orb Webhooks - Next.js Example

Minimal example of receiving Orb webhooks with signature verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- Orb account with a webhook endpoint and signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Orb webhook signing secret to `.env.local` (from Orb Dashboard → Developers → Webhooks → your endpoint).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000.

## Test

```bash
npm test
```

## Receive Webhooks Locally

Use the Hookdeck CLI — no account required, one paste-and-run line:

```bash
npx hookdeck-cli listen 3000 orb --path /webhooks/orb
```

The CLI prints a public URL. Paste it into the Orb dashboard as your webhook endpoint URL, then trigger events from Orb (or replay them from the Hookdeck UI).

## Endpoint

- `POST /webhooks/orb` — Receives and verifies Orb webhook events
