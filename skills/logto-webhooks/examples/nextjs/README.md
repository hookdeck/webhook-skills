# Logto Webhooks - Next.js Example

Minimal example of receiving Logto webhooks with signature verification (App Router).

## Prerequisites

- Node.js 18+
- Logto webhook with a signing key (Logto Console > Webhooks)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put the webhook's signing key in `.env.local` as `LOGTO_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and receives webhooks at `POST /webhooks/logto`.

## Test

```bash
npm test
```

To receive real events locally (no account required):

```bash
npx hookdeck-cli listen 3000 logto --path /webhooks/logto
```

Use the URL the CLI prints as the webhook's **Endpoint URL** in Logto Console, then use **Send test payload** to try it.
