# Bridge API Webhooks - Next.js Example

Minimal example of receiving Bridge API (`bridgeapi.io`) webhooks with signature
verification, using the Next.js App Router.

> **Not bridge.xyz.** This is Bridge API, the open-banking aggregator by Bridge
> (sister brand of Bankin'), not the bridge.xyz stablecoin payments company.

## Prerequisites

- Node.js 18+
- A Bridge API webhook configured in the dashboard (with its signing secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Bridge webhook signing secret to `.env` as `BRIDGE_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

The webhook route is available at
`POST http://localhost:3000/webhooks/bridge-api`.

## Test

### Run the unit tests

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel deliveries to your local server (no account needed):

```bash
npx hookdeck-cli listen 3000 bridge-api --path /webhooks/bridge-api
```

Then set the Hookdeck URL as the callback URL in the Bridge dashboard and click
**"Send a test"** to deliver a `TEST_EVENT`.

## Route

- `app/webhooks/bridge-api/route.ts` - Receives and verifies Bridge API webhook events

The route reads the **raw** request body with `await request.text()` before
verifying — the App Router does not auto-parse the body, so the bytes are
preserved for the HMAC check.
