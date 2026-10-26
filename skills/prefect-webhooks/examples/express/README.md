# Prefect Webhooks - Express Example

Minimal example of receiving Prefect Custom Webhook notifications and authenticating them with
a secret header.

Prefect does not sign these requests, so there is no HMAC to verify. The handler reads the
header named by `PREFECT_WEBHOOK_HEADER` (default `Authorization`) and compares the **whole**
value with `PREFECT_WEBHOOK_SECRET` in constant time (no `Bearer ` parsing). The route reads the body with `express.raw({ type: '*/*' })`, so any content type works.
It accepts POST, PUT, PATCH and GET and handles an empty body.

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp): use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Prefect Custom Webhook block with a secret header (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PREFECT_WEBHOOK_HEADER` to the header name from the block and `PREFECT_WEBHOOK_SECRET`
   to its exact whole value (including any `Bearer ` prefix).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and handles `/webhooks/prefect`.

## Test

```bash
npm test
```

The tests cover correct, wrong and missing credentials, every accepted method, empty and form
bodies. No Prefect account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/prefect \
  -H "Content-Type: application/json" \
  -H "Authorization: $PREFECT_WEBHOOK_SECRET" \
  -d '{"subject":"Flow run my-run entered state Failed","body":"boom","name":"my-webhook-block"}'
```

The body shape is illustrative: it is your block's `json_data` or `form_data` template with
`{{subject}}`, `{{body}}` and `{{name}}` substituted. Prefect adds no event field.

## Receive Webhooks Locally

Prefect can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 prefect --path /webhooks/prefect
```

Put the printed URL in the Custom Webhook block.

## How It Works

- `src/index.js`: `verifyPrefectRequest()` plus the `/webhooks/prefect` route

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. An empty body is fine; a non-empty body is parsed as form data or JSON object (`400` otherwise).
3. The handler logs `subject`, `body` and `name` from your template.
4. It returns `200 {"received": true}`.
