# CharityStack Webhooks - Express Example

Minimal example of receiving CharityStack webhooks with `X-Webhook-Signature` verification (HMAC-SHA256 over `{X-Webhook-Timestamp}.{raw body}`).

## Prerequisites

- Node.js 18+
- A CharityStack API key and a webhook registered with `POST /v1/webhooks` (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook `secret` from the create-webhook response to `.env` as `CHARITYSTACK_WEBHOOK_SECRET`. CharityStack shows the webhook secret only once, when you create the webhook. Paste it here.

## Run

```bash
npm start
```

Server runs on http://localhost:3000.

## Test

### Run unit tests

```bash
npm test
```

The tests sign payloads with the real algorithm and cover the `sha256=` and bare-digest forms, malformed signatures, missing headers, tampered and re-serialised bodies, non-JSON content types, the opt-in timestamp tolerance, and every documented event type.

### Forward live events with the Hookdeck CLI

```bash
# No account required — first run prints a public URL
npx hookdeck-cli listen 3000 charitystack --path /webhooks/charitystack
```

Register the printed URL as the webhook `url` when you call `POST /v1/webhooks`.

## Endpoint

- `POST /webhooks/charitystack` — reads the raw body with `express.raw({ type: '*/*' })`, verifies `X-Webhook-Signature` (401 on failure), then dispatches on the body's `type`.
- `GET /health` — liveness probe.

## Replay protection

Old timestamps are accepted by default, because retries and replays resend the original headers. To reject stale requests, set `CHARITYSTACK_WEBHOOK_TOLERANCE_SECONDS` (for example `300`).
