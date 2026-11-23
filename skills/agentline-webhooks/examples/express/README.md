# AgentLine Webhooks - Express Example

Minimal example of receiving AgentLine webhooks with signature verification.

AgentLine has no published Node webhook SDK, so this example verifies the
`X-Webhook-Signature` header (bare hex HMAC-SHA256 of the raw body) manually with
Node's built-in `crypto`. The body is read with `express.raw({ type: '*/*' })` so
any content type verifies.

## Prerequisites

- Node.js 18+
- An AgentLine webhook and its signing secret (shown once at creation)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your signing secret to `.env` as `AGENTLINE_WEBHOOK_SECRET`

This example reads `X-Webhook-Signature`. If you set a custom `signature_header`
in AgentLine, update the example’s header lookup. If you also verify in Hookdeck,
set the AgentLine source’s **Signature Header** to that same name.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To send a real signed delivery, call `POST /v1/webhooks/test?agent_id=...` on the
AgentLine API (fires `webhook.test`).

## Endpoints

- `POST /webhooks/agentline` - Receives and verifies AgentLine webhooks
- `GET /health` - Health check

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 3000 agentline --path /webhooks/agentline
```

Use the printed URL as the webhook `url` for your agent.
