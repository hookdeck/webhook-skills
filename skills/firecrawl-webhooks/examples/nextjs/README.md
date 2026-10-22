# Firecrawl Webhooks - Next.js Example

Minimal example of receiving Firecrawl webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Firecrawl account with the account webhook secret (Account settings > Advanced)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Firecrawl webhook secret to `.env`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 firecrawl --path /webhooks/firecrawl
```

Then start a job with the Hookdeck URL as `webhook.url`, e.g. a crawl with `"limit": 1` and `"events": ["started", "page", "completed"]`.

## Endpoint

- `POST /webhooks/firecrawl` - Receives and verifies Firecrawl webhook events (`X-Firecrawl-Signature`). Uses `request.text()` for the raw body.
