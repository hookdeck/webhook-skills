# Proxyclick Webhooks - Express Example

Minimal example of receiving Proxyclick (Eptura Visitor) webhooks and authenticating them with
HTTP Basic auth.

Proxyclick does not sign payloads. The only security option is a username and password entered
on the webhook, sent as `Authorization: Basic base64(username:password)`. The handler compares
the username and the password each in constant time, evaluating both before deciding. No event
field is documented, so the handler uses an **illustrative** body and dispatches on nothing.

## Prerequisites

- Node.js 18+
- A Proxyclick (Eptura Visitor) account with a webhook that has Basic credentials set
  (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PROXYCLICK_WEBHOOK_USERNAME` and `PROXYCLICK_WEBHOOK_PASSWORD` to the credentials you
   entered on the webhook.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/proxyclick`.

## Test

```bash
npm test
```

The tests send an illustrative body (not Proxyclick's documented schema) with correct, wrong and
missing Basic credentials. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/proxyclick \
  -u "$PROXYCLICK_WEBHOOK_USERNAME:$PROXYCLICK_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"visitor":{"firstName":"Ada"},"visit":{"id":"illustrative-1"}}'
```

## Receive Proxyclick Webhooks Locally

```bash
npx hookdeck-cli listen 3000 proxyclick --path /webhooks/proxyclick
```

Use the printed URL as the webhook's destination URL in Proxyclick and enter the same Basic
credentials there.

## How It Works

- `src/index.js`: `verifyProxyclickRequest()` plus the `POST /webhooks/proxyclick` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type works.
2. `Authorization: Basic ...` is parsed (scheme case-insensitive, split on the first colon) and
   the username and password are compared in constant time. Missing, malformed or wrong returns `401`
   with no `WWW-Authenticate` challenge: credentials must arrive on the first request.
3. The body must be a JSON object (`400` otherwise).
4. It returns `200 {"received": true}`.

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.
