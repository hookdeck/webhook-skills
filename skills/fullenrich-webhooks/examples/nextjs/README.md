# FullEnrich Webhooks - Next.js Example

Minimal example of receiving FullEnrich webhooks with signature verification (`X-Signature-SHA1`, HMAC-SHA1 keyed with your API key).

## Prerequisites

- Node.js 18+
- FullEnrich account with an API key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your FullEnrich API key to `.env` (FullEnrich has no separate webhook secret)

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 fullenrich --path /webhooks/fullenrich
```

Use the printed URL as `webhook_url` (or `webhook_events.contact_finished`) in your Start Bulk Enrichment request.

## Test

```bash
npm test
```
