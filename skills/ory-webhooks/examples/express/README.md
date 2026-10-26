# Ory Webhooks - Express Example

Minimal example of receiving Ory Actions webhooks and authenticating them with the `api_key`
header you configured.

Ory does not sign webhooks, so there is no HMAC to verify. The handler compares the configured
header (`ORY_WEBHOOK_HEADER`, default `Authorization`) with `ORY_WEBHOOK_SECRET` in full and in
constant time. A static credential authenticates the sender, not the body, and gives no replay
protection: use HTTPS and rotate it if it leaks. The route reads the body with `express.raw({ type: '*/*' })`, so any
content type works, accepts POST, PUT and PATCH (and GET with no body), and covers non-blocking
actions only (`response.ignore: true`).

## Prerequisites

- Node.js 18+
- An Ory Network project with an action using `api_key` auth (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `ORY_WEBHOOK_HEADER` to the action's `auth.config.name` and `ORY_WEBHOOK_SECRET` to its
   `auth.config.value`, exactly (including any `Bearer ` prefix).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `/webhooks/ory`.

## Test

```bash
npm test
```

The tests cover correct, wrong and missing credentials, each method, empty and invalid bodies,
and every event. No Ory account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/ory \
  -H "Content-Type: application/json" \
  -H "Authorization: $ORY_WEBHOOK_SECRET" \
  -d '{"event":"registration.after","identity":{"id":"abc"}}'
```

(Use your own header name if it isn't `Authorization`.)

## Receive Webhooks Locally

Ory can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 ory --path /webhooks/ory
```

Put the printed URL in the Ory action.

## How It Works

- `src/index.js`: `verifyOryRequest()` / `verify_ory_request()` plus the `/webhooks/ory` route

1. The configured header is compared with the secret before the body is parsed. Failure returns `401`.
2. An empty body is fine; a non-empty body must be a JSON object (`400` otherwise).
3. The handler dispatches on an `event` field from the illustrative Jsonnet template
   `function(ctx) { event: 'registration.after', identity: ctx.identity }`: `registration.after`,
   `login.after`, `settings.after`, `verification.after`, `recovery.after`.
4. It returns `200 {"received": true}`.
