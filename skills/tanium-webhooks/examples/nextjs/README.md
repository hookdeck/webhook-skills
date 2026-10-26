# Tanium Webhooks - Next.js Example

Minimal example of receiving Tanium Connect HTTP destination deliveries and authenticating them
with the Header Authentication secret.

Tanium does not sign requests, so there is no HMAC to verify. The handler compares the header you
named (`TANIUM_WEBHOOK_HEADER`, default `Authorization`) with `TANIUM_WEBHOOK_SECRET` in constant
time, comparing the whole value. A static secret authenticates the sender, not the body, and gives
no replay protection: use HTTPS and rotate it if it leaks. The route file exports `POST`, `PUT` and `PATCH`; the check lives in `lib/verify-tanium.ts`.

## Prerequisites

- Node.js 18+
- A Tanium Connect connection with an HTTP destination using Header Authentication (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `TANIUM_WEBHOOK_HEADER` to the Auth Header Name and `TANIUM_WEBHOOK_SECRET` to the exact
   Secret you entered on the destination.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts `POST`, `PUT` and `PATCH` at `/webhooks/tanium`.

## Test

```bash
npm test
```

The tests cover correct, wrong and missing headers, all three methods, JSON arrays and objects,
other content types and empty bodies. No Tanium account is needed. The payload is illustrative:
Tanium defines no event field.

To try it by hand:

```bash
curl -X PUT http://localhost:3000/webhooks/tanium \
  -H "Content-Type: application/json" \
  -H "$TANIUM_WEBHOOK_HEADER: $TANIUM_WEBHOOK_SECRET" \
  -d '[{"Computer Name":"host-1.example.com","IP Address":"10.0.0.5"}]'
```

## Receive Webhooks Locally

Tanium Cloud can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 tanium --path /webhooks/tanium
```

Put the printed URL in the Tanium Connect HTTP destination. Hookdeck's Tanium source pre-selects
`POST`; if the destination sends another method, allow it on the source too.

## How It Works

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. An empty body is accepted; otherwise the body must be a JSON object or array (`400` otherwise).
3. A JSON array is treated as a list of records, an object as one record. There is no event field.
4. It returns `200 {"received": true}`.
