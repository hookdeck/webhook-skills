# Axiom Webhooks - Express Example

Minimal example of receiving Axiom monitor webhooks and authenticating them with a secret header.

Axiom does not sign requests, so there is no signature to verify. You add a secret header to a
**Custom webhook notifier** (the plain Webhook notifier cannot send one) and the handler compares
that header with the value you stored, in full and in constant time. The route reads the body with `express.raw({ type: '*/*' })`, so any content type works.

> A static shared credential authenticates the sender, not the body, and gives no replay
> protection. Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- An Axiom monitor with a Custom webhook notifier (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `AXIOM_WEBHOOK_HEADER` to the header name you added to the notifier (default
   `Authorization`) and `AXIOM_WEBHOOK_SECRET` to its exact, whole value, including any
   `Bearer ` prefix.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/axiom`.

## Test

```bash
npm test
```

The tests send the default-template `Open` and `Closed` payloads (an illustrative payload) with
correct, wrong and missing header values. No Axiom account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/axiom \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"action":"Open","event":{"monitorID":"CabI3w142069etTgd0","title":"Axiom Monitor Test"}}'
```

## Receive Webhooks Locally

Axiom can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 axiom --path /webhooks/axiom
```

Put the printed URL in the Custom webhook notifier's Webhook URL.

## How It Works

- `src/index.js`: `verifyAxiomRequest()` plus the `POST /webhooks/axiom` route

1. The secret header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `action` field of the default template: `Open` or `Closed`.
4. It returns `200 {"received": true}`.
