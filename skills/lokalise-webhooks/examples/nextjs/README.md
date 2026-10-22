# Lokalise Webhooks - Next.js Example

Minimal example of receiving Lokalise webhooks in a Next.js (App Router) route handler and
authenticating them with the webhook secret Lokalise sends in the `X-Secret` header.

Lokalise does not sign payloads, so there is no HMAC to verify. The handler compares the
header against your configured secret with a constant-time comparison.

## Prerequisites

- Node.js 18+
- A Lokalise project with the Webhooks app installed (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `LOKALISE_WEBHOOK_SECRET` to the secret shown in Lokalise (Apps > Webhooks). If you
   configured `X-Api-Key` or a custom header instead of `X-Secret`, set
   `LOKALISE_WEBHOOK_HEADER` to that header name.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/lokalise`.

## Test

```bash
npm test
```

The tests call the route handler with a correct, wrong, differently sized and missing
secret, and check the event dispatch and the setup ping. No Lokalise account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/lokalise \
  -H "Content-Type: application/json" \
  -H "X-Secret: $LOKALISE_WEBHOOK_SECRET" \
  -d '{"event":"project.keys.added","keys":[{"id":1,"name":"test.title"}]}'
```

## Receive Lokalise Webhooks Locally

Lokalise can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 lokalise --path /webhooks/lokalise
```

Put the printed URL in the Webhooks app's **URL** field.

## How It Works

- `lib/verify-lokalise.ts`: `verifyLokaliseRequest()`, the constant-time header check
- `app/webhooks/lokalise/route.ts`: the `POST` handler and event dispatch

1. The header (`X-Secret`, or the name in `LOKALISE_WEBHOOK_HEADER`) is checked before the
   body is read. Failure returns `401`.
2. The body is parsed as JSON and dispatched on its `event` field
   (`project.translation.updated`, `project.keys.added`, `project.task.closed`, ...).
3. Lokalise's setup ping (and any body that isn't an event) is acknowledged with `200`.
4. Lokalise expects a 2xx within 8 seconds, otherwise it retries for up to 24 hours.
