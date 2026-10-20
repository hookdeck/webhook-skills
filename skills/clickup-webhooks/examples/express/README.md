# ClickUp Webhooks - Express Example

Minimal example of receiving ClickUp webhooks with `X-Signature` verification.

## Prerequisites

- Node.js 18+
- A ClickUp webhook created via the API, and its `webhook.secret` (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your ClickUp `webhook.secret` to `.env` as `CLICKUP_WEBHOOK_SECRET`

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
npx hookdeck-cli listen 3000 clickup --path /webhooks/clickup
```

Use the Hookdeck URL as the `endpoint` when you call ClickUp's Create Webhook API, then create or update a task in the subscribed location.

### Send a signed request manually

```bash
BODY='{"event":"taskCreated","task_id":"abc123","webhook_id":"7fa3ec74-69a8-4530-a251-8a13730bd204"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$CLICKUP_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST http://localhost:3000/webhooks/clickup \
  -H "Content-Type: application/json" \
  -H "X-Signature: $SIG" \
  -d "$BODY"
```

## Endpoint

- `POST /webhooks/clickup` - Receives and verifies ClickUp webhook events. Returns `400` (not `401`) on a bad signature, because ClickUp suspends webhooks that answer `401`.
