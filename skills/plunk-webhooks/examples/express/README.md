# Plunk Webhooks - Express Example

Minimal example of receiving Plunk workflow webhooks and authenticating them with a secret header.

Plunk does not sign webhooks, so there is no HMAC to verify. You add a secret header to the
workflow's Webhook step and the handler compares it, in constant time, with `PLUNK_WEBHOOK_SECRET`
(the exact, whole header value, including any `Bearer ` prefix). The header name is yours:
`PLUNK_WEBHOOK_HEADER` (default `Authorization`). A static shared credential authenticates the
sender, not the body, and gives no replay protection, so use HTTPS and rotate it if it leaks.

The route accepts `GET`, `POST`, `PUT`, `PATCH` and `DELETE` (the step's method is yours,
default `POST`), checks the credential first for every method, and handles an empty body.

## Prerequisites

- npm start
- A Plunk workflow with a Webhook step (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PLUNK_WEBHOOK_HEADER` and `PLUNK_WEBHOOK_SECRET` to the header you added on the step.
   Use a static value, not a `{{variable}}`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `/webhooks/plunk`.

## Test

```bash
npm test
```

The tests send every method, the default body for each event type and custom bodies, with correct,
wrong and missing secrets. No Plunk account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/plunk \
  -H "Content-Type: application/json" \
  -H "Authorization: $PLUNK_WEBHOOK_SECRET" \
  -d '{"contact":{"email":"user@example.com"},"workflow":{"id":"wf_1","name":"Bounce Notifications"},"execution":{"id":"exec_1"},"event":{"bounceType":"Permanent","bouncedAt":"2025-01-15T10:30:00.000Z"}}'
```

## Receive Webhooks Locally

Plunk can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 plunk --path /webhooks/plunk
```

Put the printed URL in the Webhook step. In Hookdeck, the Plunk source pre-selects `POST` without
managing the method, so allow any other method your step uses on the source too.

## How It Works

Node.js 18+
