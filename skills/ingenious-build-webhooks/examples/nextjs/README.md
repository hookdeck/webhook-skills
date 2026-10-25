# INGENIOUS.BUILD Webhooks - Next.js Example

Minimal example of receiving INGENIOUS.BUILD Custom Accounting Integration webhooks and
authenticating them with the auth header you add to each webhook URL.

INGENIOUS.BUILD does not sign payloads, so there is no HMAC to verify. The handler looks up the
header named by `INGENIOUS_BUILD_WEBHOOK_HEADER` (default `Authorization`) case-insensitively and
compares its **whole** value with `INGENIOUS_BUILD_WEBHOOK_SECRET` in constant time (no `Bearer `
parsing). The route reads the body with `request.text()`, so any content type works. A static shared credential authenticates the sender, not the body, and gives no replay
protection: use HTTPS and rotate the credential if it leaks.

Add an auth header, such as Authorization: Bearer <token>, to each webhook URL on the Custom Accounting Integration.

## Prerequisites

- Node.js 20+
- An INGENIOUS.BUILD workspace with the Custom Accounting Integration (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `INGENIOUS_BUILD_WEBHOOK_HEADER` to the header name you added and
   `INGENIOUS_BUILD_WEBHOOK_SECRET` to its exact, whole value (including any `Bearer ` prefix).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/ingenious-build`.

## Test

```bash
npm test
```

The tests send every documented event with correct, wrong and missing header values. No
INGENIOUS.BUILD account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/ingenious-build \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token-here" \
  -d '{"name":"invoice_exported_to_accounting","subject":"invoice","data":{"id":"1","invoice_number":"INV-123"}}'
```

## Receive Webhooks Locally

INGENIOUS.BUILD can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 ingenious-build --path /webhooks/ingenious-build
```

Put the printed URL in the Custom Accounting Integration.

## How It Works

- `lib/verify-ingenious-build.ts`: `verifyIngeniousBuildRequest()`; `app/webhooks/ingenious-build/route.ts`: the `POST /webhooks/ingenious-build` route

1. The auth header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `name` field: `budget_exported_to_accounting`,
   `budget_change_exported_to_accounting`, `contract_exported_to_accounting`,
   `contract_change_exported_to_accounting`, `invoice_exported_to_accounting`.
4. It returns `200 {"received": true}`.
