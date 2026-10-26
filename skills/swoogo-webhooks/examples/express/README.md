# Swoogo Webhooks - Express Example

Minimal example of receiving Swoogo webhooks and authenticating them with a secret header.

Swoogo does not sign payloads, so there is no HMAC to verify. You add a custom header to the
webhook; the handler compares that header's whole value with `SWOOGO_WEBHOOK_SECRET` using a
constant-time comparison. A static credential authenticates the sender, not the body, and gives no
replay protection, so use HTTPS and rotate the secret if it leaks. The route reads the body with `express.raw({ type: '*/*' })`, so any content type works. Both `json` and
form-encoded (`post`) bodies are accepted.

## Prerequisites

- Node.js 18+
- A Swoogo account that can create webhooks (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `SWOOGO_WEBHOOK_HEADER` to the header name you added to the Swoogo webhook (default
   `Authorization`) and `SWOOGO_WEBHOOK_SECRET` to its exact, whole value, including any
   `Bearer ` prefix.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/swoogo?object=registrant`.

## Test

```bash
npm test
```

The tests cover correct, wrong, missing and prefix-stripped credentials, JSON and form-encoded
bodies, and every trigger object. No Swoogo account is needed.

To try it by hand:

```bash
curl -X POST "http://localhost:3000/webhooks/swoogo?object=registrant" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret" \
  -d '{"id":1234,"first_name":"Ada","email":"ada@example.com"}'
```

## Receive Webhooks Locally

Swoogo can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 swoogo --path /webhooks/swoogo
```

Use the printed URL (plus `?object=registrant`) as the webhook `url` in Swoogo.

## How It Works

- `src/index.js`: `verifySwoogoRequest()` plus the `POST /webhooks/swoogo` route

1. The secret header is checked before the body is parsed. Failure returns `401`.
2. The body is parsed as JSON or form fields by `Content-Type` (`400` if neither is an object).
3. The handler dispatches on the `object` query parameter (this skill's convention: one Swoogo
   webhook per trigger object): `event`, `contact`, `registrant`, `speaker`, `sponsor`,
   `session`, `session_attendance`, `registrant_line_item`. Payloads are illustrative.
4. It returns `200 {"received": true}`.
