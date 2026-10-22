# Apify Webhooks - Express Example

Minimal example of receiving Apify webhooks and authenticating them with a secret header.

Apify does not sign payloads, so there is no HMAC to verify. You add a secret header with the
webhook's **Headers template** (e.g. `{"X-Webhook-Secret": "..."}`) and the handler compares it
with `APIFY_WEBHOOK_SECRET` in constant time. The header name is read from `APIFY_WEBHOOK_HEADER`
(default `X-Webhook-Secret`) and the whole value is compared as-is, including any `Bearer ` prefix.
The route reads the body with `express.raw({ type: '*/*' })`, so any content type works.

> A static shared credential authenticates the sender, not the body, and gives no replay
> protection (no signature, no timestamp). Use HTTPS and rotate the secret if it leaks.

## Prerequisites

- Node.js 18+
- An Apify account with an Actor or task (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `APIFY_WEBHOOK_SECRET` to the value you put in the webhook's Headers template, and
   `APIFY_WEBHOOK_HEADER` to its header name if you didn't use `X-Webhook-Secret`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/apify`.

## Test

```bash
npm test
```

The tests send every documented run and build event with correct, wrong and missing secrets. No
Apify account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/apify \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $APIFY_WEBHOOK_SECRET" \
  -d '{"eventType":"ACTOR.RUN.SUCCEEDED","eventData":{"actorId":"fW4MyDhgwtMLrB987","actorRunId":"uPBN9qaKd2iLs5naZ"}}'
```

## Receive Webhooks Locally

Apify can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 apify --path /webhooks/apify
```

Put the printed URL in the Apify webhook's Request URL.

## How It Works

- `src/index.js`: `verifyApifyRequest()` plus the `POST /webhooks/apify` route

1. The secret header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `eventType`: `ACTOR.RUN.CREATED`, `ACTOR.RUN.SUCCEEDED`,
   `ACTOR.RUN.FAILED`, `ACTOR.RUN.ABORTED`, `ACTOR.RUN.TIMED_OUT`, `ACTOR.RUN.RESURRECTED`,
   `ACTOR.BUILD.CREATED`, `ACTOR.BUILD.SUCCEEDED`, `ACTOR.BUILD.FAILED`, `ACTOR.BUILD.ABORTED`,
   `ACTOR.BUILD.TIMED_OUT`.
4. It returns `200 {"received": true}`.

`X-Apify-Webhook` and `X-Apify-Webhook-Dispatch-Id` are system headers, not secrets, and are not
used for authentication.
