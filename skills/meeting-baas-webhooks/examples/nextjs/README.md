# Meeting BaaS Webhooks - Next.js Example

Minimal example of receiving Meeting BaaS webhooks in the Next.js App Router with signature
verification using the official [`svix`](https://www.npmjs.com/package/svix) library
(Meeting BaaS v2 delivers account-level webhooks through Svix).

## Prerequisites

- Node.js 18+
- A Meeting BaaS account with a webhook endpoint added in account settings, and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Meeting BaaS signing secret to `.env.local` as `MEETING_BAAS_WEBHOOK_SECRET`. It is the
   signing secret of the endpoint you added in your account settings (Meeting BaaS prints no secret in
   its docs; Svix endpoint secrets start with `whsec_`).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/meeting-baas
```

## Test

```bash
npm test
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`), including deliveries that carry the `webhook-*`
header names instead of `svix-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 meeting-baas --path /webhooks/meeting-baas
```

1. In your Meeting BaaS account settings, add a webhook endpoint with the tunnel URL. Endpoints are
   not created through the API, and every endpoint receives all bot and calendar events.
2. Copy the endpoint's signing secret into `.env.local`.

Only Meeting BaaS v2 account-level webhooks are signed this way. Per-bot callbacks (`callback_config`,
which send an `x-mb-secret` header) and v1 API webhooks are not, and fail verification.

## Event Handling

The route reads the event name from the top-level `event` field of the `{event, data}` envelope, routes
these 12 events, and acknowledges anything else with `200`:

- `bot.status_change`, `bot.completed`, `bot.chat_message`, `bot.failed`
- `calendar.connection_created`, `calendar.connection_updated`, `calendar.connection_deleted`, `calendar.connection_error`
- `calendar.events_synced`, `calendar.event_created`, `calendar.event_updated`, `calendar.event_cancelled`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
