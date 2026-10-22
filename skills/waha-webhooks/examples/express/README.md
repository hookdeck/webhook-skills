# WAHA Webhooks - Express Example

Minimal example of receiving [WAHA](https://waha.devlike.pro/) (WhatsApp HTTP API) webhooks with `X-Webhook-Hmac` signature verification (HMAC-SHA512).

## Prerequisites

- Node.js 18+
- A running WAHA instance with a session whose webhook has an HMAC key (`config.webhooks[].hmac.key`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the same HMAC key you gave WAHA to `.env` as `WAHA_WEBHOOK_HMAC_KEY`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 waha --path /webhooks/waha
```

Use the printed URL as the `url` of the session webhook in WAHA.

### Send a signed request by hand

```bash
BODY='{"event":"message","session":"default","engine":"WEBJS","payload":{"from":"11111111111@c.us","body":"Hi"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha512 -hmac "$WAHA_WEBHOOK_HMAC_KEY" | sed 's/^.* //')
curl -X POST http://localhost:3000/webhooks/waha \
  -H 'Content-Type: application/json' \
  -H "X-Webhook-Hmac: $SIG" -H 'X-Webhook-Hmac-Algorithm: sha512' -d "$BODY"
```

### Run tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/waha` - Receives and verifies WAHA events (`message`, `message.any`, `message.ack`, `message.reaction`, `session.status`, `group.v2.join`, `presence.update`). The body is read with `express.raw({ type: '*/*' })` so any content type verifies.
