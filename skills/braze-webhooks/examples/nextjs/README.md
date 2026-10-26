# Braze Webhooks - Next.js Example

Minimal example of receiving Braze webhooks and authenticating them with the Basic
authentication credential Braze sends.

Braze does not sign webhooks, so there is no HMAC to verify. The handler parses
`Authorization: Basic base64(username:password)` and compares the username and password each in
constant time. The route reads the body with `request.text()`, so any content type works. It accepts `POST`, `PUT`, `PATCH`, `GET` and `DELETE` (the marketer
chooses the method), handles an empty body, and accepts JSON or raw text bodies.

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Braze workspace with a Basic authentication credential (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `BRAZE_WEBHOOK_USERNAME` and `BRAZE_WEBHOOK_PASSWORD` to the credential's values (Settings > Credential Management).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and serves `/webhooks/braze`.

## Test

```bash
npm test
```

The tests send every supported method with correct, wrong, missing and malformed credentials, and
with JSON, text and empty bodies. No Braze account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/braze \
  -u "$BRAZE_WEBHOOK_USERNAME:$BRAZE_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"message_body":"Your order just arrived!","user_id":"u_123"}'
```

## Receive Webhooks Locally

Braze can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 braze --path /webhooks/braze
```

Put the printed URL in the Braze webhook composer and select your credential.

## How It Works

- `lib/verify-braze.ts`: `verifyBrazeRequest()`
- `app/webhooks/braze/route.ts`: one handler exported as `POST`, `PUT`, `PATCH`, `GET` and `DELETE`

1. The method must be one of the five above.
2. The `Authorization` header is checked before the body is parsed. Failure returns `401`.
3. The body is classified as JSON, raw text or empty and passed to the handler. Braze adds no
   event field, so the example logs the body; replace the `TODO`s with your logic.
4. It returns `200 {"received": true}`.
