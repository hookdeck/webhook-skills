# Recurly Webhooks - Express Example

Minimal example of receiving Recurly webhooks in Express with `recurly-signature`
HMAC-SHA256 verification and optional HTTP Basic Auth.

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
npm start
```

Server runs on http://localhost:3000 and receives webhooks at
`POST /webhooks/recurly`.

## Test

Run the test suite (generates real signatures with Recurly's algorithm):

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Recurly webhooks to your local server — no account
or install required:

```bash
npx hookdeck-cli listen 3000 recurly --path /webhooks/recurly
```

Point your Recurly endpoint URL at the tunnel URL the CLI prints, then perform an
action in the Recurly Admin UI (e.g. create a test subscription on a sandbox
site).

## How It Works

1. `express.raw({ type: '*/*' })` captures the **raw** request body — required
   because the signature is computed over the exact bytes Recurly sent.
2. Optional HTTP Basic Auth is checked when credentials are configured.
3. The `recurly-signature` header is verified with HMAC-SHA256 over
   `` `${timestamp}.${rawBody}` `` (accepting any of multiple signatures during a
   24h key rotation).
4. Only after verification is the JSON parsed and dispatched by notification type
   (the single top-level key).

## Optional: confirm state via the Recurly API

Webhooks can arrive out of order. For critical flows, install the SDK and fetch
the referenced object to confirm its current state:

```bash
npm install recurly
```

```javascript
const recurly = require('recurly');
const client = new recurly.Client(process.env.RECURLY_API_KEY);
const sub = await client.getSubscription('uuid-' + data.subscription.uuid);
```
