# Setting Up AgentLine Webhooks

## Prerequisites

- An AgentLine account, an agent, and an API key (`al_live_...`)
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## Create the Webhook and Get Your Signing Secret

```bash
curl -X POST https://api.agentline.cloud/v1/webhooks \
  -H "Authorization: Bearer al_live_..." \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "AGENT_ID", "url": "https://yourapp.com/webhooks/agentline"}'
```

The response contains the **full `secret` once**. Save it as
`AGENTLINE_WEBHOOK_SECRET`; later reads return it masked. You may also supply your
own `secret` in the request. Each agent has at most one webhook; POSTing again
replaces it. (The Python SDK equivalent is `client.webhooks.set(agent_id=..., url=...)`.)

## Hookdeck Setup: Keep the Default Signature Header

Keep the default `X-Webhook-Signature` header on the AgentLine webhook. AgentLine
lets you set a custom `signature_header`, but **a custom signature_header isn't
supported** by Hookdeck's AgentLine source, which only checks `X-Webhook-Signature`.
Do not set `signature_header` (omit it, or leave it at the default).

## Test the Webhook

```bash
curl -X POST "https://api.agentline.cloud/v1/webhooks/test?agent_id=AGENT_ID" \
  -H "Authorization: Bearer al_live_..."
```

This sends a signed `webhook.test` event through the same pipeline as real events
(404 if no webhook is configured). Other management calls: `GET /v1/webhooks`,
`DELETE /v1/webhooks?agent_id=...`.

## Local Development

```bash
npx hookdeck-cli listen 3000 agentline --path /webhooks/agentline
```

Use the printed URL as the webhook `url`.
