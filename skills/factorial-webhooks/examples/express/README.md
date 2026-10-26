# Factorial Webhooks - Express Example

Minimal example of receiving Factorial webhooks and authenticating them with the
`x-factorial-wh-challenge` header.

Factorial does not sign payloads, so there is no HMAC to verify. Set a `challenge` on the webhook
subscription: **without one, Factorial sends nothing to verify.** The handler compares the whole
`x-factorial-wh-challenge` value with `FACTORIAL_WH_CHALLENGE` using a constant-time comparison.
The route reads the body with `express.raw({ type: '*/*' })`, so any content type works.

## Prerequisites

- Node.js 18+
- A Factorial webhook subscription created with a `challenge` (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `FACTORIAL_WH_CHALLENGE` to the `challenge` you set on the subscription.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/factorial`.

## Test

```bash
npm test
```

The tests send every handled subscription type with correct, wrong and missing challenges. No
Factorial account is needed.

To try it by hand:

```bash
curl -X POST "http://localhost:3000/webhooks/factorial?type=timeoff/leave/create" \
  -H "Content-Type: application/json" \
  -H "x-factorial-wh-challenge: $FACTORIAL_WH_CHALLENGE" \
  -d '{"id":42,"employee_id":2,"start_on":"2026-11-02","finish_on":"2026-11-06"}'
```

## Receive Webhooks Locally

Factorial can't reach `localhost` and only delivers over HTTPS. Tunnel to your machine with the
Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 factorial --path /webhooks/factorial
```

Use the printed URL as the `target_url` of the subscription.

## How It Works

- `src/index.js`: `verifyFactorialRequest()` plus the `POST /webhooks/factorial` route

1. The `x-factorial-wh-challenge` header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object, the affected resource itself (`400` otherwise).
3. There is no event field: the subscription decides the type. This example dispatches on a
   `?type=` query parameter you add to each subscription's `target_url` (our convention, not
   Factorial's), for example `employees/employee/create_with_contract`, `timeoff/leave/create`
   or `ats/application/create`. Unknown or missing types are acknowledged and logged.
4. It returns `200 {"received": true}`.

A static challenge authenticates the sender, not the body, and gives no replay protection. Use
HTTPS and rotate the challenge if it leaks.
