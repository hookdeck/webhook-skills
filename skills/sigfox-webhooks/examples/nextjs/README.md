# Sigfox Webhooks - Next.js Example

Minimal example of receiving Sigfox custom callbacks and authenticating them with a secret
header, using the Next.js App Router.

Sigfox does not sign callbacks, so there is no HMAC to verify. The route compares the header you
added to the callback (`SIGFOX_WEBHOOK_HEADER`, default `Authorization`) with
`SIGFOX_WEBHOOK_SECRET`, the exact whole value, in constant time. A static credential
authenticates the sender, not the body, and gives no replay protection, so use HTTPS and rotate
it if it leaks. The route reads the body as text and exports `GET`, `POST` and `PUT`, including
empty bodies.

## Prerequisites

- Node.js 18+
- A Sigfox device type with a custom callback (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `SIGFOX_WEBHOOK_HEADER` and `SIGFOX_WEBHOOK_SECRET` to match the header in your callback.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts `GET`, `POST` and `PUT` at `/webhooks/sigfox`.

## Test

```bash
npm test
```

The tests cover every callback type, all three methods, form and JSON bodies, and correct,
wrong, missing and prefix-stripped credentials. No Sigfox account is needed.

To try it by hand:

```bash
curl "http://localhost:3000/webhooks/sigfox?device=1A2B3C&data=0102030405" \
  -H "Authorization: $SIGFOX_WEBHOOK_SECRET"
```

## Receive Webhooks Locally

Sigfox can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 sigfox --path /webhooks/sigfox
```

Put the printed URL in the Sigfox callback's URL pattern.

## How It Works

- `lib/verify-sigfox.ts`: `verifySigfoxRequest()` and `classifyCallback()`
- `app/webhooks/sigfox/route.ts`: the `GET`/`POST`/`PUT` handler

1. The credential header is checked before the body is read. Failure returns `401`.
2. Variables come from the query string and/or the body (JSON or form-encoded); an empty body is
   fine. An unparseable body returns `400`.
3. The callback type isn't in the request, so it is inferred from the fields: `data uplink`,
   `data bidir`, `data advanced`, `service status`, `service acknowledge`, `service repeater`,
   `error`.
4. It returns `200 {"received": true, "type": ...}`.
