# Clockify Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [Clockify](https://clockify.me) webhooks and verifying the `Clockify-Signature` webhook token.

## Prerequisites

- Node.js 18+
- A Clockify workspace (owner or admin) with a webhook and its Signing secret (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `CLOCKIFY_WEBHOOK_SIGNING_SECRET` in `.env.local` to the webhook's Signing secret (comma-separate several webhooks' tokens).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/clockify` in [app/webhooks/clockify/route.ts](app/webhooks/clockify/route.ts); the verification code is in [lib/verify-clockify.ts](lib/verify-clockify.ts).

## Test

```bash
npm test
```

The tests cover the configured token, a comma-separated list, other tokens, the event type header, a missing header, invalid JSON, and a missing token.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 clockify --path /webhooks/clockify
```

Use the printed URL as the webhook's endpoint, then trigger its event (for example, add a time entry).

## Notes

- `Clockify-Signature` is the webhook's token, not a signature of the body, so it's compared directly in constant time.
