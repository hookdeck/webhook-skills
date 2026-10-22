# PropelAuth Webhooks - Express Example

Minimal example of receiving PropelAuth webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (PropelAuth delivers webhooks through Svix).

## Prerequisites

- Node.js 18+
- PropelAuth project with a webhook endpoint and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your PropelAuth signing secret to `.env` as `PROPELAUTH_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/propelauth
```

The route uses `express.raw({ type: '*/*' })` so the raw bytes are verified for any content type.

## Test

```bash
npm test
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`).

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 propelauth --path /webhooks/propelauth
```

1. In the PropelAuth Dashboard, go to **Integrations > Webhooks** and add the tunnel URL to your test endpoint.
2. Copy that endpoint's signing secret into `.env`.
3. Trigger an event, for example sign up a test user.

## Event Handling

The handler routes these events and logs anything else:

- `user.created`
- `user.updated`
- `user.deleted`
- `org.created`
- `user.added_to_org`

PropelAuth's docs say each payload includes the event type but don't name the field, so the
handler reads `event_type` and falls back to `type`. Check the event catalog in your Dashboard.
