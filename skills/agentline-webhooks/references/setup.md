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

## Match the signature header in Hookdeck

Enter the webhook’s signing secret on your Hookdeck AgentLine source. Leave
**Signature Header** blank if AgentLine uses its default, `X-Webhook-Signature`.
If you set `signature_header` to a custom name when creating the webhook, enter
that name in **Signature Header**. Send a signed test event to confirm verification.
[AgentLine’s Set Webhook reference](https://docs.agentline.cloud/api-reference/webhooks/set-webhook)

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
