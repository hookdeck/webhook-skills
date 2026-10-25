# Cyberimpact Webhooks - Express Example

Minimal example of receiving Cyberimpact webhooks and authenticating them with the secret header
you add to the scenario's **Send a webhook** action.

Cyberimpact does not sign payloads, so there is no HMAC to verify. The handler looks up the header
named in `CYBERIMPACT_WEBHOOK_HEADER` (default `Authorization`, case-insensitive) and compares its
whole value with `CYBERIMPACT_WEBHOOK_SECRET` in constant time. The route reads the body with
`express.raw({ type: '*/*' })`, so any content type works, and parses it only after the check.

> A static shared credential authenticates the sender, not the body, and gives no replay
> protection. Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Cyberimpact account with marketing automation (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CYBERIMPACT_WEBHOOK_HEADER` to the header key and `CYBERIMPACT_WEBHOOK_SECRET` to its exact
   value. Use a simple header name without spaces or special characters, such as `Authorization`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/cyberimpact`.

Receive webhooks locally with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 cyberimpact --path /webhooks/cyberimpact
```

## Test

```bash
npm test
```

The tests cover correct, wrong and missing credentials, custom header names, and the
`automation.webhook.send` event. No Cyberimpact account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/cyberimpact \
  -H "Content-Type: application/json" \
  -H "Authorization: $CYBERIMPACT_WEBHOOK_SECRET" \
  -d '{"id":"test_evt_1","event":"automation.webhook.send","timestamp":"2024-05-28T12:56:40Z","idClient":3,"data":{"type":"member","id":54321,"email":"john.doe@example.org"}}'
```
