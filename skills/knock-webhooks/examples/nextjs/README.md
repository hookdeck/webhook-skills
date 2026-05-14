# Knock Webhooks - Next.js Example

Minimal example of receiving Knock outbound webhooks with `x-knock-signature` verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Knock webhook endpoint with its per-endpoint signing secret (Developers → Webhooks → endpoint detail)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Knock webhook signing secret to `.env.local`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000.

## Test

### Run unit tests

```bash
npm test
```

### Forward live events with the Hookdeck CLI

```bash
# No account required — first run prints a public URL
npx hookdeck-cli listen 3000 knock --path /webhooks/knock
```

Use the printed URL as the destination when creating your Knock webhook endpoint, then trigger a workflow (or click **Send test event** in the Knock dashboard).

## Endpoint

- `POST /webhooks/knock` — verifies `x-knock-signature` and dispatches on `event.type`.
