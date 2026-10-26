# Hostaway Webhooks - Express Example

Minimal example of receiving Hostaway webhooks and authenticating them with HTTP Basic auth.

Hostaway does not sign payloads, so there is no HMAC to verify. The handler parses `Authorization: Basic base64(username:password)` and compares the username and password each in constant time. A static credential authenticates the sender, not the body, and gives no replay protection: use HTTPS and rotate the login and password if they leak. Hostaway's docs don't name the HTTP method, so the route accepts GET, POST, PUT, PATCH and DELETE, checks the credential first for each, and handles an empty body.

> Set a login and password on the Hostaway webhook. Webhooks without them send nothing to verify.

## Prerequisites

- Node.js 18+
- A Hostaway account with the webhook login and password set (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `HOSTAWAY_WEBHOOK_USERNAME` and `HOSTAWAY_WEBHOOK_PASSWORD` to the login and password on the Hostaway webhook.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `/webhooks/hostaway`.

## Test

```bash
npm test
```

The tests cover every method, wrong and missing credentials, malformed headers (invalid base64, junk after valid credentials), colons in the password, empty and non-JSON bodies, and each event. No Hostaway account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/hostaway \
  -u "$HOSTAWAY_WEBHOOK_USERNAME:$HOSTAWAY_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"event":"reservation.created","data":{"id":1001}}'
```

## Receive Webhooks Locally

Hostaway can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 hostaway --path /webhooks/hostaway
```

Put the printed URL in the Hostaway webhook settings. Hookdeck's Hostaway source pre-selects POST without managing the method, so allow any other method Hostaway uses on the source too. Hookdeck never sends a 401 challenge, so the credentials must arrive with each request.

## How It Works

- `src/index.js`: `verifyHostawayRequest()` plus the `app.all` route using `express.raw({ type: '*/*' })`

1. The `Authorization` header is checked before the body is read, for every method. Failure returns `401`.
2. The body is read raw so any content type works; an empty or non-JSON body is acknowledged and logged.
3. The event name is read from `event`, `eventType`, or `object` + `action`, then dispatched: `reservation.created`, `reservation.updated`, `message.received`, `task.created`, `task.updated`. Unknown shapes are logged.
4. It returns `200 {"received": true}`.

The payload in the tests is illustrative; Hostaway doesn't document the unified webhook body field by field.
