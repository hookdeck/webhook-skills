# Aimfox Webhooks - Express Example

Minimal example of receiving Aimfox webhooks and authenticating them with the webhook's
Authentication Header.

Aimfox does not sign payloads, so there is no HMAC to verify. The handler reads the header named
by `AIMFOX_WEBHOOK_HEADER` (default `Authorization`) and compares its whole value with
`AIMFOX_WEBHOOK_SECRET` in constant time. A static shared credential authenticates the sender, not
the body, and gives no replay protection, so use HTTPS and rotate the credential if it leaks. The
route reads the body with `express.raw({ type: '*/*' })`, so any content type works.

## Prerequisites

- Node.js 18+
- An Aimfox workspace with a webhook (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `AIMFOX_WEBHOOK_HEADER` to the header name and `AIMFOX_WEBHOOK_SECRET` to the exact whole
   value (including any `Bearer ` prefix) you entered in the webhook's **Authentication Header**.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/aimfox`.

## Test

```bash
npm test
```

The tests send every documented event with correct, wrong and missing credentials. No Aimfox
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/aimfox \
  -H "Content-Type: application/json" \
  -H "Authorization: $AIMFOX_WEBHOOK_SECRET" \
  -d '{"id":"evt_1","event_type":"new_connection","event":{},"workspace":{"id":"w1"}}'
```

## Receive Webhooks Locally

Aimfox can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 aimfox --path /webhooks/aimfox
```

Put the printed URL in the Aimfox webhook.

## How It Works

- `src/index.js`: `verifyAimfoxRequest()` plus the `POST /webhooks/aimfox` route

1. The configured header is checked before the body is parsed. Missing or different returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `event_type`: `account_logged_in`, `account_logged_out`,
   `new_connection`, `view`, `connect`, `accepted`, `inmail`, `message`, `new_reply`, `reply`,
   `inmail_reply`, `lead_label_added`, `campaign_created`, `campaign_started`, `campaign_ended`,
   `inbox_event`, `campaign_reply`.
4. It returns `200 {"received": true}`.
