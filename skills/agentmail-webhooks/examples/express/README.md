# AgentMail Webhooks - Express Example

Minimal example of receiving [AgentMail](https://agentmail.to) webhooks with signature verification, using the official [`svix`](https://www.npmjs.com/package/svix) library that AgentMail recommends.

## Prerequisites

- Node.js 22+ (required by `svix` 2.x)
- An AgentMail account and a webhook signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your AgentMail webhook signing secret to `AGENTMAIL_WEBHOOK_SECRET` in `.env`. It's shown in the AgentMail Console when you create the webhook, or fetch it with `client.webhooks.get(webhookId)` (see [setup](../../references/setup.md)).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/agentmail`.

## Test

```bash
npm test
```

The tests sign payloads with AgentMail's (Svix's) algorithm, `base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{svix-id}.{svix-timestamp}.{raw body}"))`, and cover every main event type, tampered bodies, wrong secrets, stale and future timestamps, multiple signatures, missing headers, `event_id` deduplication, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 agentmail --path /webhooks/agentmail
```

Register the printed URL in the AgentMail Console (**Webhooks → Create Webhook**) or with `client.webhooks.create({ url, eventTypes: ["message.received"] })`, then send an email to one of your inboxes.

## Notes

- This example is an ES module (`"type": "module"`) because `svix` 2.x ships ESM only.
- The route uses `express.raw()`. The signature covers the exact raw body bytes, so `express.json()` before verification breaks it.
- `svix` 2.x `verify()` returns nothing and throws on failure. `verifyAgentMailWebhook` parses the JSON itself after verification.
- If `AGENTMAIL_WEBHOOK_SECRET` is unset the handler returns `500`. It never accepts unverified requests.
- Deduplication uses the payload's `event_id`, not `svix-id`, because `svix-id` differs between organization, pod and inbox webhooks for the same event.
- AgentMail needs a `2xx` within **15 seconds**. Enqueue the event and process it asynchronously in production.
