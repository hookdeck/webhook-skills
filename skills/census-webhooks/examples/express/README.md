# Census Webhooks - Express Example

Minimal example of receiving Census (Fivetran Activations) sync webhooks with signature verification (`X-Signature`, base64 HMAC-SHA256 of the raw body).

## Prerequisites

- Node.js 18+
- A Census / Fivetran Activations workspace with a webhook created (Webhooks tab > Add Webhook), and its one-time secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CENSUS_WEBHOOK_SECRET` in `.env` to the secret shown when you created the webhook. It is displayed once, so copy it then.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Receive real webhooks locally with Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 census --path /webhooks/census
```

Start the server and the CLI, then add a webhook in Census pointing at the Hookdeck URL the CLI prints and subscribe it to the sync events you want. Trigger a sync run to receive `sync.triggered`, `sync.started`, and `sync.completed` / `sync.success` / `sync.failed`.

## Endpoint

- `POST /webhooks/census` - Receives and verifies Census webhook events. The route uses `express.raw({ type: '*/*' })` so the signature is checked against the exact bytes whatever the `Content-Type`.
