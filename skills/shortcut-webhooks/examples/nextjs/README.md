# Shortcut Webhooks - Next.js Example

Minimal example of receiving Shortcut outgoing webhooks with signature verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- Shortcut workspace where you can create an Outgoing Webhook
- A secret string entered when creating the webhook (Shortcut only signs events when a secret is set)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your webhook secret to `.env.local` as `SHORTCUT_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts `POST /webhooks/shortcut`.

The route reads the body with `request.text()` so the signature is checked against the exact bytes received. Verification lives in `lib/verify.ts`.

## Test

```bash
npm test
```

To receive real events locally:

```bash
npx hookdeck-cli listen 3000 shortcut --path /webhooks/shortcut
```

Use the URL the CLI prints as the webhook URL in Shortcut, with the same secret as `SHORTCUT_WEBHOOK_SECRET`, then edit a story.
