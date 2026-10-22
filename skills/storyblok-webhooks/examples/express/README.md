# Storyblok Webhooks - Express Example

Minimal example of receiving Storyblok webhooks with signature verification (HMAC-SHA1 hex of the raw body in the `webhook-signature` header). This is not Standard Webhooks, so no `standardwebhooks`/`svix` library is used.

## Prerequisites

- Node.js 18+
- A Storyblok space on a paid plan (Webhook secrets are not available on free plans)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the Webhook secret you set in Storyblok (**Settings → Webhooks**) to `.env` as `STORYBLOK_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the automated tests (they generate real HMAC-SHA1 signatures):

```bash
npm test
```

To receive real Storyblok webhooks locally, use the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 storyblok --path /webhooks/storyblok
```

Then set the Hookdeck URL as the **Endpoint URL** in **Settings → Webhooks** and publish a story.

## Endpoint

- `POST /webhooks/storyblok` - Verifies `webhook-signature`, then dispatches on `action` plus the entity id field. Reads the body with `express.raw({ type: '*/*' })` so any content type verifies.
- `GET /health` - Health check

Task (Tasks app) webhooks are unsigned and are not handled by this route.
