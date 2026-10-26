# Fireberry Webhooks - Next.js Example

Minimal example of receiving Fireberry webhook automations and authenticating them with a secret
header.

Fireberry does not sign requests, so there is no HMAC to verify. You add a secret header to the
webhook action, and the handler compares it **in full** (no `Bearer ` parsing) in constant time.
A static shared credential authenticates the sender, not the body, and gives no replay
protection: use HTTPS and rotate it if it leaks. The route accepts POST, PUT, PATCH, GET and
DELETE and handles an empty body. The event names are an **illustrative** body convention, since
Fireberry defines no event field.

## Prerequisites

- Node.js 18+
- A Fireberry automation with a Webhook action (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `FIREBERRY_WEBHOOK_HEADER` to the header key you added in the action, and
   `FIREBERRY_WEBHOOK_SECRET` to its exact whole value (including any `Bearer ` prefix).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and serves `/webhooks/fireberry`.

## Test

```bash
npm test
```

The tests cover the correct, wrong, missing and different-length header values, a custom header
name, every method, empty bodies, any content type and the illustrative events. No Fireberry
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/fireberry \
  -H "Content-Type: application/json" \
  -H "Authorization: $FIREBERRY_WEBHOOK_SECRET" \
  -d '{"event":"account.created","record":{"id":"a1b2c3","accountname":"Acme Ltd"}}'
```

## Receive Webhooks Locally

Fireberry can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 fireberry --path /webhooks/fireberry
```

Put the printed URL in the webhook action. Hookdeck's Fireberry source pre-selects only
POST, so allow other methods on the source if your automation uses one.

## How It Works

- `lib/verify-fireberry.ts`: `verifyFireberryRequest()`
- `app/webhooks/fireberry/route.ts`: `POST`, `PUT`, `PATCH`, `GET` and `DELETE` exports

1. The configured header is checked before the body is read. Failure returns `401`.
2. An empty body (e.g. GET) is acknowledged with `200`.
3. Otherwise the body must be a JSON object (`400` if not).
4. The handler dispatches on the illustrative `event` field: `account.created`, `record.updated`.
5. It returns `200 {"received": true}`.
