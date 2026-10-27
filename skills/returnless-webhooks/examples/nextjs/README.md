# Returnless Webhooks - Next.js Example

Minimal example of receiving Returnless webhooks with signature verification (`X-Signature`, lowercase hex HMAC-SHA256 of the raw body), using the App Router.

## Prerequisites

- Node.js 18+
- A Returnless webhook with its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `RETURNLESS_WEBHOOK_SECRET` in `.env.local` to the webhook's signing secret (Integrations -> Webhooks in the Returnless panel).

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
npx hookdeck-cli listen 3000 returnless --path /webhooks/returnless
```

Start the dev server and the CLI, then add an endpoint in Returnless pointing at the Hookdeck URL the CLI prints and select the events you want.

## Endpoint

- `POST /webhooks/returnless` - Receives and verifies Returnless webhook events (`app/webhooks/returnless/route.ts`). The handler reads the raw bytes with `request.arrayBuffer()` so verification works whatever the `Content-Type`, and dispatches on the `X-Event-Name` header.
