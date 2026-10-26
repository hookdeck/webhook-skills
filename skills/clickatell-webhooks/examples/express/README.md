# Clickatell Webhooks - Express Example

Minimal example of receiving Clickatell One API callbacks and authenticating them with a Custom
Security Header.

Covers One API callbacks only. Add a Custom Security Header to the callback URL.

Clickatell callbacks are not signed, so there is no HMAC to verify. The handler compares the header
you configured (`CLICKATELL_WEBHOOK_HEADER`, default `Authorization`) with the exact, whole value in
`CLICKATELL_WEBHOOK_SECRET` using a constant-time comparison. The route reads the body with
`express.raw({ type: '*/*' })`, so any content type works.

## Prerequisites

- Node.js 18+
- A Clickatell One API integration with a Custom Security Header on its callback URL (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CLICKATELL_WEBHOOK_HEADER` to the header name and `CLICKATELL_WEBHOOK_SECRET` to its exact value, including any `Bearer ` prefix you typed in the portal.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/clickatell`.

## Test

```bash
npm test
```

The tests send every documented event kind with correct, wrong and missing header values. No
Clickatell account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/clickatell \
  -H "Content-Type: application/json" \
  -H "Authorization: $CLICKATELL_WEBHOOK_SECRET" \
  -d '{"integrationId":"abc","integrationName":"My integration","event":{"moText":[{"channel":"whatsapp","messageId":"1","from":"2799900001","to":"2799900002","timestamp":1506607698000,"content":"hello"}]}}'
```

## Receive Webhooks Locally

Clickatell can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 clickatell --path /webhooks/clickatell
```

Put the printed URL in the Clickatell callback URL settings.

## How It Works

- `src/index.js`: `verifyClickatellRequest()` plus the `POST /webhooks/clickatell` route

1. The Custom Security Header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object with an `event` object (`400` otherwise).
3. The handler dispatches on the key inside `event`: `messageStatusUpdate`, `messageFallback`,
   `statusIsTyping`, `moText`, `moMedia`, `moLocation`, `moContacts`, `moSuggestedResponse`,
   `moListPickerResponse`, `moButtonResponse`. Unknown kinds are acknowledged.
4. It returns `200 {"received": true}`.

A static header authenticates the sender, not the body, and gives no replay protection. Use HTTPS
and rotate the value if it leaks.
