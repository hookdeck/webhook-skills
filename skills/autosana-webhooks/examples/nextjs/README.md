# Autosana Webhooks - Next.js Example

Minimal example of receiving Autosana webhooks with signature verification (`X-Autosana-Signature-256`, HMAC-SHA256 of the raw body) using the App Router.

## Prerequisites

- Node.js 18+
- Autosana account with a webhook that has a signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add the signing secret of your Autosana webhook (Settings > Integrations > Webhooks) to `.env.local` as `AUTOSANA_WEBHOOK_SECRET`. Without a signing secret Autosana sends unsigned payloads, and this handler rejects them.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/autosana`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 autosana --path /webhooks/autosana
```

Use the Hookdeck URL as the endpoint URL of your Autosana webhook, then use the Test button or complete a batch of flow runs.

## Test

```bash
npm test
```
