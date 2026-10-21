# Pipedream Webhooks - Express Example

Minimal example of receiving Pipedream Connect webhooks: **trigger webhooks** verified with the `x-pd-signature` header (HMAC-SHA256 hex over `<t>.<raw body>`, 5-minute replay window), and unsigned **connection webhooks** (`CONNECTION_SUCCESS` / `CONNECTION_ERROR`) guarded by a secret token you put in the URL.

## Prerequisites

- Node.js 18+
- A Pipedream Connect project and the signing key shown when you saved the webhook URL (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. In `.env`, set `PIPEDREAM_WEBHOOK_SIGNING_KEY` to the signing key exactly as Pipedream showed it, and optionally `PIPEDREAM_CONNECT_WEBHOOK_TOKEN` to a random string for connection webhooks.

## Run

```bash
npm start
```

Server runs on http://localhost:3000.

## Endpoints

- `POST /webhooks/pipedream`: trigger webhooks. Verifies `x-pd-signature` and returns `400` on a missing, malformed, stale or wrong signature.
- `POST /webhooks/pipedream/connect`: connection webhooks. Pipedream doesn't sign these; when `PIPEDREAM_CONNECT_WEBHOOK_TOKEN` is set, the request must carry `?token=<value>`. Pass that full URL as `webhook_uri` when you create a Connect token.

## Test

### Run unit tests

```bash
npm test
```

The tests sign payloads with Pipedream's algorithm and cover valid, missing, malformed, stale and tampered signatures, plus both connection events.

### Receive live events with the Hookdeck CLI

```bash
# No account required; the first run prints a public URL
npx hookdeck-cli listen 3000 pipedream --path /webhooks/pipedream
```

Set the printed URL as the webhook URL in your Pipedream project settings (or as `webhook_url` when deploying a trigger), copy the signing key it shows into `.env`, then deploy a trigger. Many triggers emit a few historical events on deploy unless you pass `emit_on_deploy: false`, which makes a quick end-to-end check.
