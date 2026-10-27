# SurveyMethods Webhooks - Next.js Example

Minimal example of receiving SurveyMethods webhooks with signature verification (App Router).

## Prerequisites

- Node.js 18+
- A SurveyMethods account on a plan with webhooks (Professional, Team Professional or Enterprise) and a webhook signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```
3. Add your webhook signing secret (shown once after saving the webhook in Account > Webhooks) to `.env.local`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and the endpoint is `/webhooks/surveymethods`.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 surveymethods --path /webhooks/surveymethods
```

The route reads `await request.arrayBuffer()` (raw bytes) before parsing, so the exact body is verified.
