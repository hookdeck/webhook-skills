# Mistral Webhooks - Next.js Example

Minimal example of receiving Mistral AI Studio voice agent webhooks with signature verification, using the App Router.

## Prerequisites

- Node.js 18+
- Mistral AI Studio account with a webhook endpoint and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Mistral endpoint signing secret to `.env`

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
npx hookdeck-cli listen 3000 mistral --path /webhooks/mistral
```

Then register the Hookdeck URL as the endpoint in Mistral, and subscribe your agent to `call_started`, `call_ended` and `call_failed`.

## Endpoint

- `POST /webhooks/mistral` - Receives and verifies Mistral webhook events (`app/webhooks/mistral/route.ts`, verification in `lib/verify.ts`)
