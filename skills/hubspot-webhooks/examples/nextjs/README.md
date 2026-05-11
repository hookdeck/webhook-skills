# HubSpot Webhooks - Next.js Example

Minimal example of receiving HubSpot webhooks with `X-HubSpot-Signature-v3` verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A HubSpot app with webhook subscriptions and its Client Secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your HubSpot app Client Secret to `.env.local`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 hubspot --path /webhooks/hubspot
```

Use the printed Hookdeck URL as the **Target URL** for your HubSpot app's webhook subscriptions.

## Endpoint

- `POST /webhooks/hubspot` - Receives and verifies HubSpot webhook events
