# Webex Webhooks - Express Example

Minimal example of receiving Webex webhooks with `X-Spark-Signature` verification.

## Prerequisites

- Node.js 18+
- A Webex bot or integration token, and a webhook created with a `secret`
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

3. Add the `secret` you chose when creating the webhook to `.env` as `WEBEX_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real HMAC-SHA1 signatures):

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 webex --path /webhooks/webex
```

Use the printed URL (with the `/webhooks/webex` path) as the `targetUrl` when you
create the webhook with `POST https://webexapis.com/v1/webhooks`.

### Trigger Test Events

- Post a message in a room your bot is in (`messages.created`)
- Add or remove someone in a group room (`memberships.created` / `memberships.deleted`)
- Create or lock a room (`rooms.created` / `rooms.updated`)

## Endpoint

- `POST /webhooks/webex` - Verifies `X-Spark-Signature` and processes Webex webhook events
