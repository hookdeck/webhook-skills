# Torii Webhooks - Next.js Example

Minimal example of receiving Torii workflow custom-action requests and authenticating them with
a secret header.

Torii has no native event webhooks and does not sign requests. A workflow's **Custom action
(HTTP Request)** sends whatever method, URL, headers and JSON body the workflow author defines.
The handler reads the header named in `TORII_WEBHOOK_HEADER` (default `Authorization`) and
compares its **whole** value with `TORII_WEBHOOK_SECRET` in constant time. The route reads the
body as text (`request.text()`), so any content type works, and parses it only after the
credential check.

## Prerequisites

- Node.js 18+
- A Torii workflow with a Custom action (HTTP Request) step (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `TORII_WEBHOOK_HEADER` to the header name you added to the custom action, and
   `TORII_WEBHOOK_SECRET` to its exact value (including any `Bearer ` prefix you typed).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts POST, PUT, PATCH, GET and DELETE at
`/webhooks/torii` (the route exports a handler for each).

## Test

```bash
npm test
```

The tests cover correct, wrong and missing credentials, every accepted method, empty bodies and
non-JSON content types. No Torii account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/torii \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-long-random-secret" \
  -d '{"workflow":"new app discovered","app":{"name":"Example App"}}'
```

## Receive Webhooks Locally

Torii can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 torii --path /webhooks/torii
```

Put the printed URL in the custom action. If the action uses a method other than POST, allow it
on the Hookdeck source too (the Torii source pre-selects POST only).

## How It Works

- `app/webhooks/torii/route.ts` and `lib/verify-torii.ts`: the route handlers and `verifyToriiRequest()`

1. The credential header is checked before the body is parsed. Failure returns `401`.
2. An empty body is fine; a non-empty body must be valid JSON (`400` otherwise).
3. `handleWorkflowRequest()` dispatches on `workflow`, a field made up for this example. Torii
   adds no event field, so the body shape is whatever your workflow template defines.
4. It returns `200 {"received": true}`.

A static shared credential authenticates the sender, not the body, and gives no replay
protection. Use HTTPS and rotate the credential if it leaks.
