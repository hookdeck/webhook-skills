# Ayrshare Webhooks - Next.js Example

Minimal example of receiving Ayrshare webhooks with signature verification
(`X-Authorization-Content-SHA256-V2`, HMAC-SHA256 of the raw body).

> Register a webhook secret with Ayrshare. Without one, deliveries are unsigned and fail verification.

## Prerequisites

- Node.js 18+
- Ayrshare account with a webhook signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `AYRSHARE_WEBHOOK_SECRET` in `.env` to the secret you registered with Ayrshare
   (`POST /hook/webhook`, the Developer Dashboard, or `POST /hook/webhook/secret`).
   If it is not set the endpoint returns `500`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

Run the unit tests:

```bash
npm test
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 ayrshare --path /webhooks/ayrshare
```

Register the Hookdeck URL with Ayrshare (`POST /hook/webhook` with an `action` such as
`scheduled` and the same `secret`). Schedule a post with a future `scheduleDate` to
receive a `scheduled` event.

## Behavior

- `401` for a missing, malformed or non-matching signature; `500` if no secret is configured
- `400` for a signed body that is not a JSON object
- Handles `scheduled`, `social`, `messages`, `comments` and `ads` actions and logs the rest
- Dedupe on the body's `hookId` (at-least-once delivery)
