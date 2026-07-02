# Recurly Webhooks - Next.js Example

Minimal example of receiving Recurly webhooks in a Next.js App Router route
handler with `recurly-signature` HMAC-SHA256 verification and optional HTTP Basic
Auth.

## Prerequisites

- Node.js 18+
- A Recurly site with a **JSON** webhook endpoint and its secret key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your endpoint's secret key to `.env` as `RECURLY_WEBHOOK_SECRET`. If you
   configured HTTP Basic Auth on the endpoint, also set `RECURLY_WEBHOOK_USER`
   and `RECURLY_WEBHOOK_PASSWORD`.

## Run

```bash
npm run dev
```

The webhook endpoint is `POST /webhooks/recurly` at
`app/webhooks/recurly/route.ts`, served at http://localhost:3000/webhooks/recurly.

## Test

```bash
npm test
```

The tests generate real signatures with Recurly's algorithm and exercise the
route handler directly.

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Recurly webhooks to your local server — no account
or install required:

```bash
npx hookdeck-cli listen 3000 recurly --path /webhooks/recurly
```

Point your Recurly endpoint URL at the tunnel URL the CLI prints.

## How It Works

1. `await request.text()` reads the **raw** body — required because the signature
   is computed over the exact bytes Recurly sent.
2. Optional HTTP Basic Auth is checked when credentials are configured.
3. The `recurly-signature` header is verified with HMAC-SHA256 over
   `` `${timestamp}.${rawBody}` `` (accepting any of multiple signatures during a
   24h key rotation). Verification lives in `app/webhooks/recurly/verify.ts`.
4. Only after verification is the JSON parsed and dispatched by notification type
   (the single top-level key).

The route sets `runtime = 'nodejs'` because it uses `node:crypto`.

## Optional: confirm state via the Recurly API

Webhooks can arrive out of order. For critical flows, install the SDK and fetch
the referenced object to confirm its current state:

```bash
npm install recurly
```

```typescript
import { Client } from 'recurly';
const client = new Client(process.env.RECURLY_API_KEY!);
const sub = await client.getSubscription('uuid-' + data.subscription.uuid);
```
