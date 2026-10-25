# Teamwork Webhooks - Express Example

Minimal example of receiving Teamwork.com Projects (Version 2) webhooks with `X-Projects-Signature` verification.

## Prerequisites

- Node.js 18+
- A Teamwork **Version 2** webhook with a **token** set (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook token to `.env` as `TEAMWORK_WEBHOOK_TOKEN`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Unit tests

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 teamwork --path /webhooks/teamwork
```

Use the Hookdeck URL as the webhook URL in Teamwork, then create or complete a task.

### Send a signed request manually

```bash
BODY='{"eventCreator":{"id":1},"task":{"id":42}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$TEAMWORK_WEBHOOK_TOKEN" -hex | sed 's/^.* //')
curl -X POST http://localhost:3000/webhooks/teamwork \
  -H "Content-Type: application/json" \
  -H "X-Projects-Event: TASK.CREATED" \
  -H "X-Projects-Signature: $SIG" \
  -d "$BODY"
```

## Endpoint

- `POST /webhooks/teamwork` - Receives and verifies Teamwork webhook events. The body is read with `express.raw({ type: '*/*' })` so any content type verifies. Returns `401` on a missing or invalid signature.
