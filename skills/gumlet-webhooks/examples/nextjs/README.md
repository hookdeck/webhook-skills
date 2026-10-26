# Gumlet Webhooks - Next.js Example

Minimal example of receiving Gumlet webhooks and authenticating them with the `x-gumlet-token`
header.

Gumlet does not sign payloads, so there is no HMAC to verify. The handler compares the
`x-gumlet-token` header (the Secret Token you set on the webhook) with `GUMLET_WEBHOOK_SECRET`
using a constant-time comparison. The route reads the body with `request.text()`, so any content type
works. A static shared credential authenticates the sender, not the body, and gives no replay
protection, so use HTTPS and rotate the Secret Token if it leaks.

## Prerequisites

- Node.js 20+
- A Gumlet account with a webhook (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `GUMLET_WEBHOOK_SECRET` to the Secret Token on the Gumlet webhook.

> Set a Secret Token on the Gumlet webhook. Webhooks without one send nothing to verify.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/gumlet`.

## Test

```bash
npm test
```

The tests send every documented event with correct, wrong and missing tokens, plus the documented
`video.status.ready` and `live.video.status.complete` payloads. No Gumlet account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/gumlet \
  -H "Content-Type: application/json" \
  -H "x-gumlet-token: $GUMLET_WEBHOOK_SECRET" \
  -d '{"type":"video.status.ready","status":"ready","asset_id":"65b168a6e99b77f116c0e488"}'
```

## Receive Webhooks Locally

Gumlet can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 gumlet --path /webhooks/gumlet
```

Put the printed URL in the Gumlet webhook settings.

## How It Works

- `lib/verify-gumlet.ts`: `verifyGumletRequest()`
- `app/webhooks/gumlet/route.ts`: the `POST /webhooks/gumlet` route

1. The `x-gumlet-token` header is checked before the body is parsed. A missing header or a
   mismatch returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `type` field: `video.status.*`, `live.video.status.*` and
   `event.*` (see [../../references/overview.md](../../references/overview.md) for the full list).
4. It returns `200 {"received": true}`.
