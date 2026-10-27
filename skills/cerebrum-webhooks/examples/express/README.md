# Cerebrum Webhooks - Express Example

Minimal example of receiving Cerebrum webhooks (delivered by Svix) with signature verification.

## Prerequisites

- Node.js 22+ (the `svix` package is ESM-only and requires it)
- A Cerebrum integration with a `postbackWebhookUrl`, and the webhook signing secret from the Svix Portal that Cerebrum gives you access to (on request)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Cerebrum webhook signing secret (the full `whsec_...` value) to `.env` as `CEREBRUM_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and receives webhooks at `POST /webhooks/cerebrum`.

## Test

Run the automated tests, which sign requests the same way Svix does:

```bash
npm test
```

To receive real deliveries locally, use the Hookdeck CLI (no install or account required):

```bash
npx hookdeck-cli listen 3000 cerebrum --path /webhooks/cerebrum
```

Set the URL it prints as your integration's `postbackWebhookUrl`.

## How It Works

- `express.raw({ type: '*/*' })` keeps the exact request bytes, whatever the content type. The body is parsed only after the signature check passes.
- The handler reads `svix-id`, `svix-timestamp` and `svix-signature`, and falls back to `webhook-id`, `webhook-timestamp` and `webhook-signature` when `svix-id` is absent.
- The `svix` library checks HMAC-SHA256 over `{id}.{timestamp}.{raw body}` against every `v1,` entry, and rejects timestamps more than 5 minutes old. Hookdeck retries and replays keep the original timestamp, so see `references/verification.md` in the skill for a manual verifier without that window.
- Missing headers or a bad signature return `400`; a missing `CEREBRUM_WEBHOOK_SECRET` returns `500` (fail closed).
