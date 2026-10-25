# AgentLine Webhooks - Next.js Example

Minimal example of receiving AgentLine webhooks with signature verification using the
Next.js App Router. Verification is manual (`crypto`): AgentLine has no published
Node webhook SDK.

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
   cp .env.example .env.local
   ```

3. Add your signing secret to `.env.local` as `AGENTLINE_WEBHOOK_SECRET`

Keep the default `X-Webhook-Signature` header on the webhook; a custom
`signature_header` isn't supported by Hookdeck's AgentLine source.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and the webhook route is `/webhooks/agentline`.

## Test

```bash
npm test
```

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 3000 agentline --path /webhooks/agentline
```

Use the printed URL as the webhook `url` for your agent, then call
`POST /v1/webhooks/test?agent_id=...` to send a signed `webhook.test` event.
