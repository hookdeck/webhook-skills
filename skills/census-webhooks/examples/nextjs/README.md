# Census Webhooks - Next.js Example

Minimal example of receiving Census (Fivetran Activations) sync webhooks with signature verification (`X-Signature`, base64 HMAC-SHA256 of the raw body), using the App Router.

## Prerequisites

- Node.js 18+
- A Census / Fivetran Activations webhook created on a group through the Activations REST API, and its secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `CENSUS_WEBHOOK_SECRET` in `.env.local` to the secret from the webhook creation flow.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Receive real webhooks locally with Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 census --path /webhooks/census
```

Start the dev server and the CLI, then add a webhook in Census pointing at the Hookdeck URL the CLI prints and subscribe it to the sync events you want.

## Endpoint

- `POST /webhooks/census` - Receives and verifies Census webhook events (`app/webhooks/census/route.ts`). The handler reads the raw bytes with `request.arrayBuffer()` so verification works whatever the `Content-Type`.
