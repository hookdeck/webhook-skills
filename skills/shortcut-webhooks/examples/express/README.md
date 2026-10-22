# Shortcut Webhooks - Express Example

Minimal example of receiving Shortcut outgoing webhooks with signature verification.

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
   cp .env.example .env
   ```

3. Add your webhook secret to `.env` as `SHORTCUT_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts `POST /webhooks/shortcut`.

The route uses `express.raw({ type: '*/*' })` so the signature is checked against the exact bytes received, whatever the content type.

## Test

```bash
npm test
```

To receive real events locally:

```bash
npx hookdeck-cli listen 3000 shortcut --path /webhooks/shortcut
```

Use the URL the CLI prints as the webhook URL in Shortcut, with the same secret as `SHORTCUT_WEBHOOK_SECRET`, then edit a story.
