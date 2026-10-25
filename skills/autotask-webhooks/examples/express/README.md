# Autotask Webhooks - Express Example

Minimal example of receiving Autotask webhooks with `X-Hook-Signature` (HMAC-SHA1) verification.

## Prerequisites

- Node.js 18+
- An Autotask webhook created through the REST API, with a `SecretKey` and a `WebhookUrl` pointing at this server

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `AUTOTASK_WEBHOOK_SECRET` in `.env` to the `SecretKey` you used when creating the webhook

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To receive real callouts locally, run the Hookdeck CLI (no install or account needed) and use the URL it prints as your webhook's `WebhookUrl`:

```bash
npx hookdeck-cli listen 3000 autotask --path /webhooks/autotask
```

Or send a signed request yourself:

```bash
BODY='{"Action":"Create","EntityType":"Ticket","Id":1,"Fields":{}}'
SIG="sha1=$(printf '%s' "$BODY" | openssl dgst -sha1 -hmac "$AUTOTASK_WEBHOOK_SECRET" -binary | base64)"
curl -X POST http://localhost:3000/webhooks/autotask -H "X-Hook-Signature: $SIG" -d "$BODY"
```
