# Payrix Pro Webhooks - Express Example

Minimal example of receiving Payrix Pro webhook alerts and authenticating them with the
Header Name and Header Value you set on the webhook action.

Payrix Pro does not sign requests, so there is no HMAC to verify. The handler compares the whole
value of your chosen header with `PAYRIX_PRO_WEBHOOK_SECRET` in constant time. A static shared
credential authenticates the sender, not the body, and gives no replay protection: use HTTPS and
rotate the credential if it leaks.

The route accepts GET, POST, PUT, PATCH and DELETE (Payrix's docs don't name the method), reads the
body with `express.raw({ type: '*/*' })` so any content type works, and checks the credential
before parsing anything. Empty bodies are fine.

## Prerequisites

- Node.js 18+
- A Payrix Pro webhook alert with an action whose Header Name and Header Value you control (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PAYRIX_PRO_WEBHOOK_HEADER` to the Header Name and `PAYRIX_PRO_WEBHOOK_SECRET` to the exact,
   whole Header Value (including any `Bearer ` prefix you typed on the action).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `/webhooks/payrix-pro`.

## Test

```bash
npm test
```

To try it by hand (the payload is illustrative; Payrix doesn't document the body):

```bash
curl -X POST http://localhost:3000/webhooks/payrix-pro \
  -H "Content-Type: application/json" \
  -H "$PAYRIX_PRO_WEBHOOK_HEADER: $PAYRIX_PRO_WEBHOOK_SECRET" \
  -d '{"alert":"transaction","transaction":{"id":"t1_txn_example","total":1500}}'
```

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 payrix-pro --path /webhooks/payrix-pro
```

Put the printed URL in the Endpoint field of the Payrix Pro webhook action.

## How It Works

- `src/index.js`: `verifyPayrixProRequest()`, `parseBody()` and the route registered for each method

1. The header is looked up case-insensitively and compared whole. Failure returns `401`.
2. JSON is parsed only when the content type says JSON (`400` if malformed); other bodies stay raw text.
3. It returns `200 {"received": true}`.
