# Proxyclick Webhooks - Next.js Example

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
npm run dev
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

- `lib/verify-proxyclick.ts`: `verifyProxyclickRequest()` and `parseBasicAuth()`
- `app/webhooks/proxyclick/route.ts`: the App Router `POST` handler

1. The request is authenticated before the body is read. Missing, malformed or wrong Basic
   credentials return `401` with no `WWW-Authenticate` challenge.
2. The body is read as text (`request.text()`), so any content type works, and must be a JSON object (`400` otherwise).
3. It returns `200 {"received": true}`.

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.
