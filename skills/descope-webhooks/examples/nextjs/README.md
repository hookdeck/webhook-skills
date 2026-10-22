# Descope Webhooks - Next.js Example

Minimal example of receiving Descope Audit Webhook connector events with signature verification (App Router).

## Prerequisites

- Node.js 18+
- Descope project with an Audit Webhook connector and an HMAC Secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put the connector's HMAC Secret in `.env.local` as `DESCOPE_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and receives webhooks at `POST /webhooks/descope`.

## Test

```bash
npm test
```

To receive real events locally (no account required):

```bash
npx hookdeck-cli listen 3000 descope --path /webhooks/descope
```

Use the URL the CLI prints as the connector's **Base URL**. Descope delivers audit events in batches after a delay of a few minutes, so don't expect instant delivery.
