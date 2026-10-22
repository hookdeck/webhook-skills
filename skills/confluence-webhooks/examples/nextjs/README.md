# Confluence Webhooks - Next.js Example

Minimal example of receiving Confluence **Data Center** webhooks with `X-Hub-Signature` verification in the App Router. (Confluence Cloud is not covered.)

## Prerequisites

- Node.js 18+
- Confluence Data Center with a webhook that has a secret set

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the webhook's secret in `.env` as `CONFLUENCE_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 (endpoint: `/webhooks/confluence`)

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 confluence --path /webhooks/confluence
```

Then use the Hookdeck URL as the webhook URL in Administration > General Configuration > Webhooks, and publish or edit a page.
