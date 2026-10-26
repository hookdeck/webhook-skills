# SurveyMethods Webhooks - Express Example

Minimal example of receiving SurveyMethods webhooks with signature verification.

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
   cp .env.example .env
   ```
3. Add your webhook signing secret (shown once after saving the webhook in Account > Webhooks) to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 surveymethods --path /webhooks/surveymethods
```

Then set the Hookdeck URL as the webhook URL in SurveyMethods. The handler reads the body with
`express.raw({ type: '*/*' })` so the exact bytes are verified for any content type.
