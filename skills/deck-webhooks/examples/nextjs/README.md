# Deck Webhooks - Next.js Example

Minimal Next.js App Router example of receiving [Deck](https://deck.co) webhooks with Standard Webhooks signature verification, using the official [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package.

## Prerequisites

- Node.js 18+
- A Deck account and API key (`sk_live_...`)
- A signing secret **you generate** (Deck doesn't issue one):
  ```bash
  node -e "console.log('whsec_' + require('crypto').randomBytes(32).toString('base64'))"
  ```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put your generated secret in `DECK_WEBHOOK_SECRET`. Use the **same** value as `webhook.secret` when you create the destination (see [setup](../../references/setup.md)). Deck can't show it to you again later.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/deck` ([app/webhooks/deck/route.ts](app/webhooks/deck/route.ts)).

## Test

```bash
npm test
```

The tests call the route handler directly with real Standard Webhooks signatures. They cover tampered bodies, stale timestamps, multiple signatures, secret rotation, duplicate deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 deck --path /webhooks/deck
```

Use the printed URL as `webhook.url` when creating the Deck destination. Once it is `active`, use **Send test ping** in the Deck Console (or `POST /v2/event-destinations/{id}/test`) to send a `test.ping`.

## Notes

- The handler reads `await request.text()`. The signature covers the exact raw body, so calling `request.json()` before verification breaks it.
- If `DECK_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- `DECK_WEBHOOK_SECRET_PREVIOUS` is optional. During a rotation Deck keeps the old secret valid for 24 hours, so the handler tries the current secret first and then the previous one.
- Deck needs a `2xx` within **5 seconds**. Enqueue the event and process it asynchronously in production.
