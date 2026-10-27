# Notifuse Webhooks - Next.js Example

Minimal example of receiving Notifuse webhooks with Standard Webhooks signature verification, using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Notifuse workspace with a webhook subscription (and its `whsec_` signing secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your subscription's signing secret to `.env.local` as `NOTIFUSE_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The endpoint is `POST /webhooks/notifuse`.

## Test

```bash
npm test
```

To receive real deliveries locally (no install or account required):

```bash
npx hookdeck-cli listen 3000 notifuse --path /webhooks/notifuse
```

Use the URL it prints as the subscription URL in Notifuse, then fire a test with `webhookSubscriptions.test`.

## Notes

- The route reads `request.text()` so the exact bytes are verified whatever the content type; it never calls `request.json()` before the check.
- The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so see `references/verification.md` of the skill for a manual verifier where the window can be dropped.
- If `webhook-id` is absent, the handler falls back to the `svix-*` headers.
