# Semaphore CI Webhooks - Express Example

Minimal example of receiving Semaphore CI notification webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Semaphore notification with a webhook secret (see [references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the `WEBHOOK_SECRET` value of the organization secret named on the notification into `.env` as `SEMAPHORE_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts POST, PUT and PATCH on `/webhooks/semaphore`.

## Test

```bash
npm test
```

To receive real notifications locally, tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 semaphore --path /webhooks/semaphore
```

Or send one by hand:

```bash
BODY='{"pipeline":{"id":"fa02c7bd-7a8b-42e0-8d6e-aa0d8a194e19","name":"Notificaitons","result":"stopped"},"project":{"name":"notifications"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SEMAPHORE_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST http://localhost:3000/webhooks/semaphore \
  -H 'Content-Type: application/json' \
  -H "X-Semaphore-Signature-256: $SIG" \
  -d "$BODY"
```
